import { traefik, vaultServer } from './modules/kubernetes/';
import { argoCDRootApp } from './modules/kubernetes/argocd';
import { cluster } from './modules/kubernetes/cluster';

export = {
  kubeconfig: cluster.kubeConfig,
  vaultToken: vaultServer.credentials.root_token,
  argoCD: argoCDRootApp.urn
};
