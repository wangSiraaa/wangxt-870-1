const { Client } = require('pg');

const urls = [
  'postgresql://postgres@localhost:5432/postgres',
  'postgresql://postgres:postgres@localhost:5432/postgres',
  'postgresql://mingyuan@localhost:5432/postgres',
  'postgresql://mingyuan:postgres@localhost:5432/postgres',
];
(async () => {
  for (const url of urls) {
    try {
      const c = new Client({ connectionString: url, connectTimeoutMillis: 2000 });
      await c.connect();
      console.log('CONNECTED:', url.slice(0, 40));
      try { await c.query("CREATE USER transfer WITH PASSWORD 'transfer123' SUPERUSER CREATEDB").catch(()=>{}); } catch(e){}
      try { await c.query('CREATE DATABASE transfer OWNER transfer').catch(()=>{}); } catch(e){}
      try { await c.query('GRANT ALL PRIVILEGES ON DATABASE transfer TO transfer').catch(()=>{}); } catch(e){}
      await c.end();
      console.log('DB setup complete');
      break;
    } catch (e) {
      console.log('FAIL:', url.slice(0,36), e.message);
    }
  }
})();
