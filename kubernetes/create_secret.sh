#!/bin/bash

export MONGO_INITDB_PASSWORD="$(< /dev/urandom tr -dc _A-Z-a-z-0-9 | head -c${1:-32};echo;)"
export MONGO_USER="juniorfox"
export MONGO_PASS="$(< /dev/urandom tr -dc _A-Z-a-z-0-9 | head -c${1:-32};echo;)"
export MONGO_DB="juniorfoxsite"

cat <<EOF > secrets.json
{
  "mongoUser": "${MONGO_USER}",
  "mongoDatabase": ${MONGO_DB},
  "mongoRootPassword": "$(echo -n ${MONGO_INITDB_PASSWORD} | base64)",
  "mongoPassword": "$(echo -n ${MONGO_PASS} | base64)"
}
EOF

echo "Secrets generated and saved to secrets.json"


cat << EOF > secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: juniorfox-site-secrets
data:
  mongoUser: $(echo ${MONGO_USER} | base64)
  mongoDatabase: $(echo ${MONGO_DB} | base64)
  mongoRootPassword: $(echo -n ${MONGO_INITDB_PASSWORD} | base64)
  mongoPassword: $(echo -n ${MONGO_PASS} | base64)
EOF

echo "Secret file created with the name secrets.yaml"