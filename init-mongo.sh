#!/bin/bash
until mongo --eval "print(\"waited for connection\")"
do
  sleep 5
done
mongo <<EOF
    use myDatabase 
    db.createUser({
      "user" : "myUser",
      "pwd" : "myPassword",
      "roles" : [{ "role" : "readWrite", "db" : "myDatabase" }]
    })
EOF
