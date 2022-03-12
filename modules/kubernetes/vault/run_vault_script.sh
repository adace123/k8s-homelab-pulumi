#!/bin/bash
until curl -o /dev/null -s --fail "$VAULT_INGRESS_URL"; do
    sleep 1
done

eval "$COMMAND"