"""Transactional alert checkpoints and at-most-once notification outbox. No candle series."""
import json,time,uuid,sqlite3
from .alert_models import AlertDefinition,AlertSettings,AlertRuntime

class AlertStore:
    LIMIT=100
    HISTORY_LIMIT=2000
    def __init__(self,db):
        self.db=db;self.error=None
        try:self.migrate()
        except (ValueError,TypeError,AssertionError,sqlite3.DatabaseError):self.error='Alert storage has an unsupported schema or invalid saved data; it was preserved. Other workspaces remain available.'
    def migrate(self):
        with self.db.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            exists=c.execute("SELECT 1 FROM sqlite_master WHERE name='alert_schema'").fetchone()
            if exists:
                versions=[r[0] for r in c.execute('SELECT version FROM alert_schema')]
                if versions!=[1]:raise ValueError('Unsupported alert schema')
                for r in c.execute('SELECT definition,runtime FROM alerts'):AlertDefinition.model_validate_json(r['definition']);AlertRuntime.model_validate_json(r['runtime'])
                row=c.execute('SELECT value FROM alert_preferences WHERE id=1').fetchone()
                if row:AlertSettings.model_validate_json(row[0])
                return
            c.execute('CREATE TABLE alert_schema(version INTEGER NOT NULL)');c.execute('INSERT INTO alert_schema VALUES(1)')
            c.execute('CREATE TABLE alerts(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,definition TEXT NOT NULL,runtime TEXT NOT NULL,created_at REAL NOT NULL,updated_at REAL NOT NULL)')
            c.execute("CREATE TABLE alert_history(id TEXT PRIMARY KEY,alert_id TEXT,revision INTEGER,candle_time INTEGER,kind TEXT NOT NULL,created_at REAL NOT NULL,payload TEXT NOT NULL,delivery TEXT NOT NULL,delivery_detail TEXT NOT NULL DEFAULT '',UNIQUE(alert_id,revision,candle_time,kind))")
            c.execute('CREATE INDEX alert_history_created ON alert_history(created_at DESC)')
            c.execute('CREATE TABLE alert_preferences(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL)')
            c.execute('INSERT INTO alert_preferences VALUES(1,?)',(AlertSettings().model_dump_json(),))
    def ready(self):
        if self.error:raise ValueError(self.error)
    def settings(self):
        self.ready()
        with self.db.connect() as c:row=c.execute('SELECT value FROM alert_preferences WHERE id=1').fetchone()
        return AlertSettings.model_validate_json(row[0])
    def save_settings(self,value):
        self.ready()
        with self.db.connect() as c:c.execute('UPDATE alert_preferences SET value=? WHERE id=1',(value.model_dump_json(),))
    def list(self):
        self.ready()
        with self.db.connect() as c:rows=c.execute('SELECT * FROM alerts ORDER BY created_at,id').fetchall()
        return [dict(id=r['id'],revision=r['revision'],definition=json.loads(r['definition']),runtime=json.loads(r['runtime']),created_at=r['created_at'],updated_at=r['updated_at']) for r in rows]
    def get(self,id):return next((r for r in self.list() if r['id']==id),None)
    def save(self,value,id=None,now=None):
        self.ready();now=time.time() if now is None else now;old=self.get(id) if id else None
        if id and not old:raise KeyError(id)
        if not old and len(self.list())>=self.LIMIT:raise ValueError('At most 100 alerts are allowed')
        if value.enabled and value.expires_at is not None and value.expires_at<=now:raise ValueError('Choose a future expiration time or disable the expired alert')
        id=id or uuid.uuid4().hex;revision=old['revision']+1 if old else 1
        runtime=dict(status='disabled' if not value.enabled else 'arming',active_since=now,last_attempt=None,last_evaluated_candle=None,last_state=None,last_successful_data=None,last_fetched_at=None,last_triggered=old['runtime'].get('last_triggered') if old else None,error=None,failures=0)
        with self.db.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            if not old and c.execute('SELECT COUNT(*) FROM alerts').fetchone()[0]>=self.LIMIT:raise ValueError('At most 100 alerts are allowed')
            actual=c.execute('SELECT revision FROM alerts WHERE id=?',(id,)).fetchone()
            if old and (not actual or actual[0]!=old['revision']):raise ValueError('This alert changed; reload before saving')
            AlertRuntime.model_validate(runtime)
            c.execute('INSERT OR REPLACE INTO alerts VALUES(?,?,?,?,?,?)',(id,revision,value.model_dump_json(),json.dumps(runtime),old['created_at'] if old else now,now))
            # Edits/rearming invalidate queued notifications from the previous definition.
            c.execute("UPDATE alert_history SET delivery='superseded' WHERE alert_id=? AND delivery='pending'",(id,))
        return self.get(id)
    def update_runtime(self,row,runtime,trigger=None,disable=False):
        self.ready();AlertRuntime.model_validate(runtime)
        with self.db.connect() as c:
            c.execute('BEGIN IMMEDIATE');actual=c.execute('SELECT revision FROM alerts WHERE id=?',(row['id'],)).fetchone()
            if not actual or actual[0]!=row['revision']:return False
            definition={**row['definition'],'enabled':False} if disable else row['definition']
            c.execute('UPDATE alerts SET runtime=?,definition=? WHERE id=?',(json.dumps(runtime),json.dumps(definition),row['id']))
            if trigger:
                c.execute('INSERT OR IGNORE INTO alert_history(id,alert_id,revision,candle_time,kind,created_at,payload,delivery) VALUES(?,?,?,?,?,?,?,?)',(uuid.uuid4().hex,row['id'],row['revision'],trigger['candle_time'],'signal',trigger['created_at'],json.dumps(trigger['payload']),trigger['delivery']))
                self.trim(c)
        return True
    def delete(self,id):
        self.ready()
        with self.db.connect() as c:
            c.execute('DELETE FROM alerts WHERE id=?',(id,));c.execute("UPDATE alert_history SET delivery='deleted' WHERE alert_id=? AND delivery='pending'",(id,))
    def trim(self,c):c.execute('DELETE FROM alert_history WHERE id NOT IN (SELECT id FROM alert_history ORDER BY created_at DESC,rowid DESC LIMIT ?)',(self.HISTORY_LIMIT,))
    def history(self):
        self.ready()
        with self.db.connect() as c:rows=c.execute('SELECT * FROM alert_history ORDER BY created_at DESC,rowid DESC LIMIT ?',(self.HISTORY_LIMIT,)).fetchall()
        return [{**dict(r),'payload':json.loads(r['payload'])} for r in rows]
    def clear_history(self):
        self.ready()
        with self.db.connect() as c:c.execute('DELETE FROM alert_history')
    def pending(self,now):
        self.ready();settings=self.settings()
        with self.db.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            if settings.paused:c.execute("UPDATE alert_history SET delivery='paused' WHERE delivery='pending' AND kind='signal'")
            from .alert_models import quiet_now
            if quiet_now(settings,now):c.execute("UPDATE alert_history SET delivery='quiet_hours' WHERE delivery='pending'")
            c.execute("UPDATE alert_history SET delivery='not_sent_stale' WHERE delivery='pending' AND created_at<?",(now-120,))
            rows=c.execute("SELECT * FROM alert_history WHERE delivery='pending' ORDER BY created_at LIMIT 10").fetchall()
            c.executemany("UPDATE alert_history SET delivery='dispatching' WHERE id=?",[(r['id'],) for r in rows])
        return [{**dict(r),'payload':json.loads(r['payload'])} for r in rows]
    def delivery(self,id,state,detail=''):
        self.ready()
        with self.db.connect() as c:c.execute("UPDATE alert_history SET delivery=?,delivery_detail=? WHERE id=? AND delivery IN ('dispatching','unconfirmed','shown_by_api')",(state,detail[:300],id))
    def retire_pending(self):
        if self.error:return
        with self.db.connect() as c:c.execute("UPDATE alert_history SET delivery='not_sent_restart' WHERE delivery IN ('pending','dispatching')")
    def test(self,payload,now):
        self.ready();id=uuid.uuid4().hex
        with self.db.connect() as c:
            c.execute("INSERT INTO alert_history(id,kind,created_at,payload,delivery) VALUES(?,'test',?,?,'pending')",(id,now,json.dumps(payload)));self.trim(c)
        return id
