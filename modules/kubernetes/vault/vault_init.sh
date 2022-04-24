#!/bin/bash

# wait until Vault deployment is up and ready to receive traffic
until curl "$VAULT_ADDR"; do
    sleep 2
done

VAULT_INIT=$(kubectl --context="$KUBECONTEXT" --kubeconfig="$KUBECONFIG" exec -it -n vault vault-0 -- \
    vault operator init -key-shares="$VAULT_KEY_SHARES" -key-threshold="$VAULT_KEY_THRESHOLD" -format=json)

echo "$VAULT_INIT" > ./vault.json

UNSEAL_KEYS=$(jq -r '.unseal_keys_b64[]' ./vault.json)

for key in $UNSEAL_KEYS; do
    kubectl --context="$KUBECONTEXT" --kubeconfig="$KUBECONFIG" exec -it -n vault vault-0 -- \
    vault operator unseal "$key"
done
