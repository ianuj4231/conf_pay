require('dotenv').config();

const app = require('./app');
const { initializeDatabase } = require('./db');

const port = Number(process.env.PORT || 3000);

initializeDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Account transaction API listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error('Database initialization failed:', error.message);
    process.exitCode = 1;
  });
