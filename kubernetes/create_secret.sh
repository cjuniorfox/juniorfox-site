#!/bin/bash

export MONGO_INITDB_PASSWORD="$(< /dev/urandom tr -dc '_A-Z-a-z-0-9' | head -c${1:-32})"
export MONGO_USER='juniorfox'
export MONGO_PASS="$(< /dev/urandom tr -dc '_A-Z-a-z-0-9' | head -c${1:-32})"
export MONGO_DBNAME='juniorfoxsite'

cat <<EOF > secrets.json
{
  "mongoUser": "$(echo -n ${MONGO_USER} | base64 -w 0)",
  "mongoDatabase": "$(echo -n ${MONGO_DBNAME} | base64 -w 0)",
  "mongoRootPassword": "$(echo -n ${MONGO_INITDB_PASSWORD} | base64 -w 0)",
  "mongoPassword": "$(echo -n ${MONGO_PASS} | base64 -w 0)"
}
EOF

echo "Secrets generated and saved to secrets.json"

cat << EOF > secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: juniorfox-site-secrets
data:
  mongoUser: $(echo -n ${MONGO_USER} | base64 -w 0)
  mongoDatabase: $(echo -n ${MONGO_DBNAME} | base64 -w 0)
  mongoRootPassword: $(echo -n ${MONGO_INITDB_PASSWORD} | base64 -w 0)
  mongoPassword: $(echo -n ${MONGO_PASS} | base64 -w 0)
EOF

echo "Secret file created with the name secret.yaml"
