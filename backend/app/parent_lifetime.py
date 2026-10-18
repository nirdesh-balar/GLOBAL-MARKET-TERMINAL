"""Private inherited stdin protocol. No HTTP shutdown endpoint or public listener."""
import hmac
import json
import os
import sys
import threading


def watch_parent(server, stream=None, token=None):
    if os.environ.get('IMT_PARENT_PIPE') != '1':
        return None
    stream = sys.stdin if stream is None else stream
    token = os.environ.get('IMT_TOKEN', '') if token is None else token

    def monitor():
        try:
            while True:
                line = stream.readline(1024)
                if not line:  # Parent died or closed its private pipe.
                    break
                try:
                    value = json.loads(line)
                    if value.get('command') == 'shutdown' and isinstance(value.get('token'), str) and token and hmac.compare_digest(value['token'], token):
                        break
                except (ValueError, AttributeError, TypeError):
                    continue
        finally:
            server.should_exit = True

    thread = threading.Thread(target=monitor, daemon=True, name='owned-parent-pipe')
    thread.start()
    return thread
