const { run } = require('./src/app');

run().catch((error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exitCode = 1;
});
