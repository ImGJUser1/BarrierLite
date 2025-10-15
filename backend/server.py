from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Depends, status, WebSocket
from fastapi.security import HTTPBearer
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
import shutil
import aiofiles  # For async file ops
import asyncio
import subprocess
import psutil  # For process monitoring
from enum import Enum
from jose import JWTError, jwt
from passlib.context import CryptContext
import socketio
from motor.motor_asyncio import AsyncIOMotorClient
from transformers import pipeline
from functools import lru_cache
import signal
import json
import threading
from concurrent.futures import ThreadPoolExecutor

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# FastAPI App
app = FastAPI(title="BarrierOS Lite Backend", version="1.0")
api_router = APIRouter(prefix="/api")

# Security
SECRET_KEY = os.environ.get("SECRET_KEY", "your-secret-key-change-me")
ALGORITHM = "HS256"
security = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_token(credentials: HTTPBearer = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        did = payload.get("did")
        if did is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid DID")
        return did
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")

# CORS (restricted, integrated with JS origins)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["http://localhost:19006", "https://your-expo-app.com", "http://localhost:8080"],  # Added JS server port
    allow_methods=["*"],
    allow_headers=["*"],
)

# SocketIO for WebRTC (with RustDesk fallback, integrated JS Socket.IO logic)
sio = socketio.AsyncServer(cors_allowed_origins='*', async_mode='asgi')
app.mount("/api/webrtc", socketio.ASGIApp(sio))

# Upload directory for APKs
UPLOAD_DIR = ROOT_DIR / 'uploads'
UPLOAD_DIR.mkdir(exist_ok=True)

# Device limits (integrated JS resource monitor concept)
MOCK_DEVICE_RAM = 4096  # MB

# RustDesk Config (from JS integration)
RUSTDESK_PATH = Path(os.environ.get('RUSTDESK_PATH', ROOT_DIR / 'rustdesk-server/target/release'))
RUSTDESK_KEY = os.environ.get('RUSTDESK_KEY', '_')
HBBS_PORTS = os.environ.get('RUSTDESK_PORTS', '21115-21117')
HBRR_PORTS = os.environ.get('RELAY_PORTS', '21116-21119')

# RustDesk Process Management (from JS)
rustdesk_processes = {}  # {sid: {'hbbs': proc, 'hbbrs': proc}}

async def start_rustdesk_server(session_id: str):
    if session_id in rustdesk_processes:
        return {"status": "already_running"}
    
    try:
        # Start hbbs (ID server)
        hbbs_proc = await asyncio.create_subprocess_exec(
            str(RUSTDESK_PATH / 'hbbs'),
            '-k', RUSTDESK_KEY,
            '-p', HBBS_PORTS,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL
        )
        # Start hbbrs (relay)
        hbbrs_proc = await asyncio.create_subprocess_exec(
            str(RUSTDESK_PATH / 'hbbrs'),
            '-k', RUSTDESK_KEY,
            '-p', HBRR_PORTS,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL
        )
        
        rustdesk_processes[session_id] = {'hbbs': hbbs_proc, 'hbbrs': hbbrs_proc}
        
        # Background monitor for CPU/RAM (integrated JS interval logic)
        asyncio.create_task(monitor_rustdesk(session_id))
        
        logger.info(f"RustDesk started for session {session_id}")
        return {"status": "started", "hbbs_pid": hbbs_proc.pid, "hbbrs_pid": hbbrs_proc.pid}
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="RustDesk binaries not found; build from source")

async def monitor_rustdesk(session_id: str):
    while session_id in rustdesk_processes:
        procs = rustdesk_processes[session_id]
        for name, proc in procs.items():
            if proc.returncode is not None:
                del rustdesk_processes[session_id]
                logger.warning(f"RustDesk {name} died for {session_id}")
                break
            try:
                p = psutil.Process(proc.pid)
                if p.cpu_percent(interval=1) > 70 or (p.memory_info().rss / 1024 / 1024) > 500:  # MB cap
                    logger.warning(f"RustDesk {name} over limit; pausing")
                    # Emit to clients via SocketIO (JS io.emit equivalent)
                    await sio.emit('rustdesk_pause', {'reason': 'resource_limit'}, room=session_id)
                    # Optional: proc.terminate()
            except psutil.NoSuchProcess:
                pass
        await asyncio.sleep(30)  # JS 30000ms equivalent

async def stop_rustdesk_server(session_id: str):
    if session_id not in rustdesk_processes:
        return {"status": "not_running"}
    
    for name, proc in rustdesk_processes[session_id].items():
        if proc.returncode is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except asyncio.TimeoutError:
                proc.kill()
    
    del rustdesk_processes[session_id]
    logger.info(f"RustDesk stopped for {session_id}")
    return {"status": "stopped"}

# Resource Monitor (integrated from JS setInterval)
async def resource_monitor():
    while True:
        # Mock DeviceInfo.getTotalRamMb() with psutil
        ram_info = psutil.virtual_memory()
        total_ram_mb = ram_info.total / (1024 * 1024)
        ram_pct = ram_info.percent / 100
        if ram_pct > 0.8:  # JS 0.8 cap
            await sio.emit('resource_warning', { 'ram': ram_pct })  # Pause sessions
            logger.warning(f"Resource warning: RAM usage {ram_pct:.2f}")
        await asyncio.sleep(30)  # 30000ms

# Start resource monitor on app startup
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(resource_monitor())

# Enums
class OSStatus(str, Enum):
    AVAILABLE = "available"
    RUNNING = "running"
    STOPPED = "stopped"

class EmulatorStatus(str, Enum):
    AVAILABLE = "available"
    DOWNLOADING = "downloading"
    INSTALLED = "installed"
    RUNNING = "running"
    ERROR = "error"

# Models (all from previous + JS integrations)
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

class OSEnvironment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    icon: str
    ramRequired: int
    status: OSStatus = OSStatus.AVAILABLE

class OSEnvironmentCreate(BaseModel):
    name: str
    icon: str = "terminal"
    ramRequired: int

class Apk(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str

class PWA(BaseModel):
    name: str
    url: str

class PWACreate(BaseModel):
    name: str
    url: str

class Suggestion(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class Message(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str
    isUser: bool
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class MessageCreate(BaseModel):
    text: str
    isUser: bool

class AutomateRequest(BaseModel):
    text: str

class AutomateResponse(BaseModel):
    response: str
    taskExecuted: bool = False
    taskType: Optional[str] = None

class Log(BaseModel):
    event: str
    data: dict
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class DeviceConnection(BaseModel):
    deviceId: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class IotScene(BaseModel):
    title: str
    description: str

class IotActivate(BaseModel):
    scene: str

class Emulator(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    platform: str  # 'android' or 'ios'
    version: str  # e.g., 'Android 12', 'iOS 18'
    status: EmulatorStatus = EmulatorStatus.AVAILABLE
    ramRequired: int  # MB, e.g., 2048 for light config
    downloadSize: int  # MB

class EmulatorCreate(BaseModel):
    platform: str
    version: str
    ramRequired: int = 2048  # Default light config for 6GB host
    downloadSize: int = 1500

class RustDeskSession(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    device_id: str
    rustdesk_id: str
    password: str
    status: str = "active"
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class RustDeskGenerate(BaseModel):
    device_id: str

# AI Lazy Loading (integrated from previous)
nlp_instance = None
nlp_lock = asyncio.Lock()

@lru_cache(maxsize=1)
async def get_nlp_pipeline():
    global nlp_instance
    async with nlp_lock:
        if nlp_instance is None:
            try:
                loop = asyncio.get_event_loop()
                nlp_instance = await loop.run_in_executor(
                    None, lambda: pipeline("text-generation", model="microsoft/Phi-3-mini-4k-instruct", device=-1)
                )
                logger.info("Phi-3 loaded lazily")
            except Exception as e:
                logger.error(f"Lazy AI load failed: {e}")
                nlp_instance = None
        return nlp_instance

# SocketIO Events (integrated JS io.on logic)
@sio.event
async def connect(sid, environ):
    logger.info(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    logger.info(f"Client disconnected: {sid}")
    # Cleanup RustDesk if tied to sid (from JS)
    if sid in rustdesk_processes:
        await stop_rustdesk_server(sid)

@sio.event
async def authenticate(sid, data):
    did = data.get('did')
    if did:
        await sio.save_session(sid, {'did': did})
        await sio.emit_to(sid, 'authenticated', {'success': True})  # JS socket.emit
        logger.info(f"Authenticated {sid} with DID {did}")
    else:
        await sio.disconnect(sid)
        logger.warning(f"Auth failed for {sid}")

@sio.event
async def join_room(sid, data):
    room = data.get('room')
    if room:
        await sio.enter_room(sid, room)
        logger.info(f"{sid} joined room {room}")
    else:
        logger.warning(f"Invalid room join attempt by {sid}")

@sio.event
async def offer(sid, data):
    room = data.get('room')
    if room:
        await sio.emit('offer', data, room=room, skip_sid=sid)
        logger.info(f"Offer sent to room {room} from {sid}")
    else:
        logger.warning(f"Invalid offer from {sid}")

@sio.event
async def answer(sid, data):
    room = data.get('room')
    if room:
        await sio.emit('answer', data, room=room, skip_sid=sid)
        logger.info(f"Answer sent to room {room} from {sid}")
    else:
        logger.warning(f"Invalid answer from {sid}")

@sio.event
async def ice_candidate(sid, data):
    room = data.get('room')
    if room:
        await sio.emit('ice-candidate', data, room=room, skip_sid=sid)
        logger.info(f"ICE candidate sent to room {room} from {sid}")
    else:
        logger.warning(f"Invalid ICE candidate from {sid}")

@sio.event
async def ice_failed(sid, data):  # Custom from JS
    room = data.get('room') or sid
    if room:
        # Fallback to RustDesk (integrated JS logic)
        session_info = await generate_rustdesk_fallback(room)
        await sio.emit('use_rustdesk', session_info, room=room, skip_sid=sid)
        logger.info(f"RustDesk fallback triggered for room {room}")

async def generate_rustdesk_fallback(room: str):
    # From JS Math.random logic
    rustdesk_id = ''.join([str(uuid.uuid4().int >> 4 & 0xFFFF)[0:2] for _ in range(4)]).upper()  # 8-char mock
    password = "123456"
    return {"rustdesk_id": rustdesk_id, "password": password, "room": room}

# Routes (integrated all previous + JS endpoints)
@api_router.get("/")
async def root():
    return {"message": "BarrierOS Lite Backend - Integrated with Standalone JS Server"}

@api_router.get("/root")  # From JS /api/root
async def standalone_root():
    return {"message": "Standalone Internal Backend"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(did: str = Depends(verify_token), input: StatusCheckCreate = None):
    status_dict = {"client_name": did}  # Use DID (from JS)
    status_obj = StatusCheck(**status_dict)
    await db.status_checks.insert_one(status_obj.dict())
    logger.info(f"Status for DID {did}")
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks(did: str = Depends(verify_token)):
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

@api_router.get("/os_environments", response_model=List[OSEnvironment])
async def get_os_environments(did: str = Depends(verify_token)):
    os_envs = await db.os_environments.find().to_list(1000)
    if not os_envs:  # JS mock fallback
        os_envs = [{"id": "1", "name": "Android Lite", "icon": "terminal", "ramRequired": 1024, "status": "available"}]
    return [OSEnvironment(**os_env) for os_env in os_envs]

@api_router.post("/os_environments", response_model=OSEnvironment)
async def create_os_environment(did: str = Depends(verify_token), input: OSEnvironmentCreate = None):
    if input.ramRequired < 500:
        raise HTTPException(status_code=400, detail="RAM allocation must be at least 500 MB")
    os_env_obj = OSEnvironment(**input.dict())
    await db.os_environments.insert_one(os_env_obj.dict())
    logger.info(f"Added OS environment: {input.name} for {did}")
    return os_env_obj

@api_router.post("/os_environments/{os_id}/toggle")
async def toggle_os_environment(did: str = Depends(verify_token), os_id: str = None):
    os_env = await db.os_environments.find_one({"id": os_id})
    if not os_env:
        raise HTTPException(status_code=404, detail="OS environment not found")
    
    current_status = os_env["status"]
    new_status = OSStatus.STOPPED if current_status == OSStatus.RUNNING else OSStatus.RUNNING
    
    if new_status == OSStatus.RUNNING and current_status != OSStatus.RUNNING:
        running_os = await db.os_environments.find({"status": OSStatus.RUNNING}).to_list(1000)
        running_ram = sum(o["ramRequired"] for o in running_os)
        if running_ram + os_env["ramRequired"] > MOCK_DEVICE_RAM:
            raise HTTPException(status_code=400, detail="Insufficient RAM to start this OS")
    
    await db.os_environments.update_one({"id": os_id}, {"$set": {"status": new_status.value}})
    logger.info(f"Toggled OS {os_id} to {new_status} for {did}")
    return {"message": f"OS toggled to {new_status}"}

@api_router.post("/upload-apk")
async def upload_apk(did: str = Depends(verify_token), file: UploadFile = File(...)):
    UPLOAD_DIR.mkdir(exist_ok=True)
    apks_count = await db.apks.count_documents({})
    if apks_count >= 2:
        raise HTTPException(status_code=400, detail="Max 2 APKs")
    if not file.filename.lower().endswith('.apk'):
        raise HTTPException(status_code=400, detail="Must be .apk")
    
    file_path = UPLOAD_DIR / file.filename
    async with aiofiles.open(file_path, 'wb') as buffer:
        content = await file.read()
        await buffer.write(content)
    
    apk_obj = Apk(filename=file.filename)
    await db.apks.insert_one(apk_obj.dict())
    logger.info(f"Uploaded {file.filename} for {did}")
    return {"filename": file.filename, "detail": "Upload successful"}  # From JS mock

@api_router.get("/apks", response_model=List[Apk])
async def get_apks(did: str = Depends(verify_token)):
    apks = await db.apks.find().to_list(2)
    return [Apk(**apk) for apk in apks]

@api_router.get("/pwas", response_model=List[PWA])
async def get_pwas(did: str = Depends(verify_token)):
    pwas = await db.pwas.find().to_list(1000)
    return [PWA(**p) for p in pwas]

@api_router.post("/pwas", response_model=PWA)
async def create_pwa(did: str = Depends(verify_token), input: PWACreate = None):
    pwa_obj = PWA(**input.dict())
    await db.pwas.insert_one(pwa_obj.dict())
    logger.info(f"Added PWA: {input.name} for {did}")
    return pwa_obj

@api_router.get("/suggestions", response_model=List[Suggestion])
async def get_suggestions(did: str = Depends(verify_token)):
    suggestions = await db.suggestions.find().to_list(1000)
    return [Suggestion(**suggestion) for suggestion in suggestions]

@api_router.post("/suggestions/accept/{suggestion_id}")
async def accept_suggestion(did: str = Depends(verify_token), suggestion_id: str = None):
    suggestion = await db.suggestions.find_one({"id": suggestion_id})
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    await db.suggestions.update_one({"id": suggestion_id}, {"$set": {"accepted": True}})
    logger.info(f"Accepted suggestion: {suggestion['title']} for {did}")
    return {"message": f"Suggestion {suggestion['title']} accepted"}

@api_router.post("/messages", response_model=Message)
async def create_message(did: str = Depends(verify_token), input: MessageCreate = None):
    message_obj = Message(**input.dict())
    await db.messages.insert_one(message_obj.dict())
    logger.info(f"Created message: {input.text} for {did}")
    return message_obj

@api_router.get("/messages", response_model=List[Message])
async def get_messages(did: str = Depends(verify_token)):
    messages = await db.messages.find().to_list(1000)
    return [Message(**message) for message in messages]

@api_router.post("/automate", response_model=AutomateResponse)
async def automate_task(did: str = Depends(verify_token), request: AutomateRequest = None):
    input_text = request.text.lower() if request else ""
    response = {"response": "", "taskExecuted": False, "taskType": None}
    
    # Keywords first (integrated JS keyword logic)
    lower_text = input_text.lower()
    if "alarm" in lower_text or "reminder" in lower_text:
        response["response"] = "Alarm scheduled locally."  # JS local
        response["taskExecuted"] = True
        response["taskType"] = "alarm"
    elif "iot" in lower_text or "light" in lower_text:
        response["response"] = "IoT command processed internally."
        response["taskExecuted"] = True
        response["taskType"] = "iot"
        # Emit to clients (JS io.emit)
        await sio.emit('iot_command', { 'cmd': input_text })
        # Forward via RustDesk if active
        active_session = await get_active_rustdesk(did)
        if active_session:
            await forward_iot_command(active_session['rustdesk_id'], input_text)
    elif "script" in lower_text or "bash" in lower_text:
        response["response"] = "Bash script generated and queued for execution."
        response["taskExecuted"] = True
        response["taskType"] = "script"
    else:
        nlp = await get_nlp_pipeline()
        if nlp:
            try:
                loop = asyncio.get_event_loop()
                ai_output = await loop.run_in_executor(
                    None, lambda: nlp(input_text, max_length=100, num_return_sequences=1)[0]['generated_text']
                )
                response["response"] = ai_output.strip()
            except Exception as e:
                logger.error(f"AI error: {e}")
                response["response"] = "AI unavailable; use keywords like 'set alarm'."
        else:
            response["response"] = "Fallback: Try 'set alarm' or 'toggle light'."  # JS fallback
    
    logger.info(f"Automate for {did}: {input_text}")
    return response

async def forward_iot_command(rustdesk_id: str, command: str):
    # Mock: In real, send via RustDesk client API or data channel
    logger.info(f"IoT forward to RustDesk {rustdesk_id}: {command}")

@api_router.post("/devices/connect")
async def connect_device(did: str = Depends(verify_token), input: DeviceConnection = None):
    await db.device_connections.insert_one(input.dict())
    logger.info(f"Device connected: {input.deviceId} for {did}")
    return {"message": "Device connected successfully"}

@api_router.post("/logs")
async def create_log(did: str = Depends(verify_token), input: Log = None):
    await db.logs.insert_one(input.dict())
    logger.info(f"Logged event: {input.event} for {did}")
    return {"message": "Event logged successfully"}

@api_router.get("/iot/scenes", response_model=List[IotScene])
async def get_iot_scenes(did: str = Depends(verify_token)):
    # Mock data (from JS)
    scenes = [
        {"title": "Lights Off at 10 PM", "description": "Turn off all lights at 10 PM daily"},
        {"title": "Good Morning", "description": "Open blinds, turn on lights at 7 AM"},
        {"title": "Away Mode", "description": "Lock doors, turn off lights when leaving"},
    ]
    return [IotScene(**s) for s in scenes]

@api_router.post("/iot/activate")
async def activate_iot_scene(did: str = Depends(verify_token), input: IotActivate = None):
    logger.info(f"Activated IoT scene: {input.scene} for {did}")
    return {"message": f"IoT scene {input.scene} activated"}

@api_router.get("/emulators", response_model=List[Emulator])
async def get_emulators(did: str = Depends(verify_token)):
    # Filter for device compatible
    emulators_cursor = await db.emulators.find({"ramRequired": {"$lte": MOCK_DEVICE_RAM}}).to_list(1000)
    return [Emulator(**em) for em in emulators_cursor]

@api_router.post("/emulators/{platform}/{version}/download", response_model=Emulator)
async def download_emulator(did: str = Depends(verify_token), platform: str = None, version: str = None):
    if platform not in ['android', 'ios']:
        raise HTTPException(status_code=400, detail="Platform must be 'android' or 'ios'")
    
    # Check if exists
    existing = await db.emulators.find_one({"platform": platform, "version": version})
    if existing:
        if existing["status"] == EmulatorStatus.INSTALLED:
            raise HTTPException(status_code=400, detail="Emulator already installed")
        elif existing["status"] == EmulatorStatus.DOWNLOADING:
            raise HTTPException(status_code=400, detail="Download in progress")
    
    # Create or update to downloading
    available_versions = {
        'android': ['Android 12', 'Android 13', 'Android 14', 'Android 15', 'Android 16'],
        'ios': ['iOS 16', 'iOS 17', 'iOS 18']  # 26 future
    }
    if version not in available_versions.get(platform, []):
        raise HTTPException(status_code=400, detail=f"Version {version} not available for {platform}")
    
    emulator_obj = Emulator(
        platform=platform,
        version=version,
        ramRequired=2048 if platform == 'android' else 3072,
        downloadSize=1500 if platform == 'android' else 2000,
        status=EmulatorStatus.DOWNLOADING
    )
    
    if existing:
        await db.emulators.update_one({"id": existing["id"]}, {"$set": {"status": EmulatorStatus.DOWNLOADING}})
        emulator_obj.id = existing["id"]
    else:
        await db.emulators.insert_one(emulator_obj.dict())
    
    # Simulate download
    asyncio.create_task(simulate_download(platform, version, emulator_obj.id))
    
    logger.info(f"Started download for {platform} {version} for {did}")
    return emulator_obj

async def simulate_download(platform: str, version: str, emulator_id: str):
    await asyncio.sleep(5)  # Mock
    try:
        await db.emulators.update_one(
            {"id": emulator_id},
            {"$set": {"status": EmulatorStatus.INSTALLED}}
        )
        logger.info(f"Simulated download complete for {platform} {version}")
    except Exception as e:
        await db.emulators.update_one(
            {"id": emulator_id},
            {"$set": {"status": EmulatorStatus.ERROR}}
        )
        logger.error(f"Download simulation failed: {e}")

@api_router.post("/emulators/{emulator_id}/run")
async def run_emulator(did: str = Depends(verify_token), emulator_id: str = None):
    emulator = await db.emulators.find_one({"id": emulator_id})
    if not emulator or emulator["platform"] != "android":
        raise HTTPException(status_code=400, detail="Android only supported")
    
    current_status = emulator.get("status", EmulatorStatus.AVAILABLE)
    new_status = EmulatorStatus.STOPPED if current_status == EmulatorStatus.RUNNING else EmulatorStatus.RUNNING
    
    if new_status == EmulatorStatus.RUNNING:
        running_emus = await db.emulators.find({"status": EmulatorStatus.RUNNING}).to_list(1000)
        running_ram = sum(e["ramRequired"] for e in running_emus)
        if running_ram + emulator["ramRequired"] > MOCK_DEVICE_RAM:
            raise HTTPException(status_code=400, detail="Insufficient RAM")
        
        try:
            avd_name = f"{emulator['version'].lower().replace(' ', '_')}"
            proc = await asyncio.create_subprocess_exec(
                "emulator", "-avd", avd_name, "-memory", str(emulator["ramRequired"]),
                "-no-snapshot-load", stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
            )
            # Port forward for RustDesk
            await asyncio.create_subprocess_exec("adb", "-s", avd_name, "forward", "tcp:21115", "tcp:21115")
            asyncio.create_task(monitor_emulator(proc.pid, emulator_id))
            logger.info(f"Emulator {avd_name} launched for {did}")
        except FileNotFoundError:
            raise HTTPException(status_code=500, detail="Android SDK/emulator not in PATH")
    
    await db.emulators.update_one({"id": emulator_id}, {"$set": {"status": new_status.value}})
    return {"message": f"Emulator toggled to {new_status}", "detail": "Success"}

async def monitor_emulator(pid: int, emulator_id: str):
    while True:
        try:
            p = psutil.Process(pid)
            if p.cpu_percent(interval=1) > 70:
                await db.emulators.update_one({"id": emulator_id}, {"$set": {"status": EmulatorStatus.STOPPED}})
                os.kill(pid, signal.SIGTERM)
                logger.warning(f"Emulator {emulator_id} stopped: High CPU")
                break
        except psutil.NoSuchProcess:
            break
        await asyncio.sleep(30)

@api_router.post("/emulators", response_model=Emulator)
async def create_emulator(did: str = Depends(verify_token), input: EmulatorCreate = None):
    if input.ramRequired > MOCK_DEVICE_RAM:
        raise HTTPException(status_code=400, detail="RAM required exceeds device limit")
    emulator_obj = Emulator(**input.dict())
    await db.emulators.insert_one(emulator_obj.dict())
    logger.info(f"Created emulator: {input.platform} {input.version} for {did}")
    return emulator_obj

# RustDesk Endpoints (integrated JS /rustdesk/generate)
@api_router.post("/rustdesk/generate", response_model=RustDeskSession)
async def generate_rustdesk_session(did: str = Depends(verify_token), input: RustDeskGenerate = None):
    device_id = input.device_id if input else did
    # From JS Math.random.toString(36)
    rustdesk_id = ''.join([str(uuid.uuid4().int >> 4 & 0xFFFF)[0:2] for _ in range(4)]).upper()
    password = "123456"  # Baked from JS
    
    # Start server if needed (from JS)
    await start_rustdesk_server(device_id)
    
    session = RustDeskSession(device_id=device_id, rustdesk_id=rustdesk_id, password=password)
    await db.rustdesk_sessions.insert_one(session.dict())
    logger.info(f"RustDesk session generated for {device_id}: ID {rustdesk_id}")
    return session

@api_router.get("/rustdesk/status/{device_id}")
async def rustdesk_status(did: str = Depends(verify_token), device_id: str = None):
    status = {"running": device_id in rustdesk_processes, "sessions": []}
    sessions = await db.rustdesk_sessions.find({"device_id": device_id}).to_list(1000)
    status["sessions"] = [RustDeskSession(**s) for s in sessions]
    return status

@api_router.post("/rustdesk/connect/{rustdesk_id}")
async def connect_rustdesk(did: str = Depends(verify_token), rustdesk_id: str = None):
    session = await db.rustdesk_sessions.find_one({"rustdesk_id": rustdesk_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    # Mock auth (from JS)
    return {"connected": True, "detail": f"Connected to {rustdesk_id}; use rustdesk://connect/{rustdesk_id}#{session.password}"}

@api_router.post("/rustdesk/stop/{session_id}")
async def stop_rustdesk_session(did: str = Depends(verify_token), session_id: str = None):
    await stop_rustdesk_server(session_id)
    await db.rustdesk_sessions.update_one({"id": session_id}, {"$set": {"status": "inactive"}})
    return {"message": "Session stopped", "detail": "RustDesk cleaned up"}

async def get_active_rustdesk(did: str):
    session = await db.rustdesk_sessions.find_one({"device_id": did, "status": "active"})
    return session

# Local DB Mock Integration (from JS AsyncStorage - optional fallback)
async def local_db_fallback(collection: str, operation: str, data: dict = None):
    # Simulate AsyncStorage with file-based JSON
    db_file = ROOT_DIR / f"local_{collection}.json"
    if operation == "insertOne":
        docs = []
        if db_file.exists():
            with open(db_file, 'r') as f:
                docs = json.load(f)
        docs.append({**data, "timestamp": datetime.utcnow().isoformat()})
        with open(db_file, 'w') as f:
            json.dump(docs, f)
        return {"success": True}
    elif operation == "find":
        if db_file.exists():
            with open(db_file, 'r') as f:
                return json.load(f)
        return []
    return None

app.include_router(api_router)

@app.on_event("shutdown")
async def shutdown():
    client.close()
    for session_id in list(rustdesk_processes.keys()):
        await stop_rustdesk_server(session_id)
    logger.info("Shutdown complete")