#!/bin/bash
unset NODE_OPTIONS
cd /projects/sandbox/temp-mail

# Clean up any existing data
rm -f data/emails.json

# Start server in background
node server/app.js &
SERVER_PID=$!
sleep 2

# Run tests
node test.js
TEST_EXIT=$?

# Cleanup
kill $SERVER_PID 2>/dev/null
exit $TEST_EXIT
