#!/bin/bash
kubectl wait --for=jsonpath='{.status.phase}'=Running pod/vault-0 -n kube-system

eval "$COMMAND"