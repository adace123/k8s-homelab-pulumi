import { K8SVaultServer } from './server';
import { VaultAddons } from './types';
import * as pulumi from '@pulumi/pulumi';

const vaultConfig = new pulumi.Config('vault');
const keyShares = vaultConfig.getNumber('key-shares') || 5;
const keyThreshold = vaultConfig.getNumber('key-threshold') || 3;
const ingressHost = vaultConfig.get('ingress-host') || 'vault.local.k8s';
const ingressPort = vaultConfig.getNumber('ingress-port') || 8000;
const addons = vaultConfig.getObject<Array<VaultAddons>>('addons');

export const vaultServer = new K8SVaultServer('k8s-vault-server', {
  keyShares,
  keyThreshold,
  ingressHost,
  ingressPort,
  addons
});
