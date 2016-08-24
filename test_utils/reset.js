var exec = require('child_process').asCallback;

console.log("Reseting courtbot_test");

exec("dropdb 'courtbot_test'", function(err, std) {
  exec("createdb 'courtbot_test'", function(err, std) {
    exec("DATABASE_URL=postgres://localhost:5432/courtbot_test node utils/createQueuedTable.js", function(err, std) {
      exec("DATABASE_URL=postgres://localhost:5432/courtbot_test node utils/createRemindersTable.js", function(err, std) {
        if (!err) {
          console.log("Finished");
        }
      });
    });
  });
});
