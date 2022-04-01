#!/bin/bash
# until curl -o /dev/null -s --fail "$VAULT_INGRESS_URL"; do
#     sleep 1
# done
kubectl wait --for=jsonpath='{.status.phase}'=Running pod/vault-0 -n kube-system

eval "$COMMAND"