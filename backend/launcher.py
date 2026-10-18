import os
from pathlib import Path
from app.preview_seed import seed_preview
import json
import socket
import uvicorn
from app.main import create_app
from app.parent_lifetime import watch_parent

if __name__ == '__main__':
    if os.environ.get('IMT_PREVIEW_SEED_DB') and os.environ.get('IMT_DATA_DIR'):
        seed_preview(Path(os.environ['IMT_PREVIEW_SEED_DB']),Path(os.environ['IMT_DATA_DIR'])/'terminal.sqlite3')
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(('127.0.0.1', 0))
    sock.listen(128)
    print(json.dumps({'ready': True, 'port': sock.getsockname()[1]}), flush=True)
    server = uvicorn.Server(uvicorn.Config(create_app(), log_level='warning', access_log=False, timeout_graceful_shutdown=5))
    watch_parent(server)
    server.run(sockets=[sock])
