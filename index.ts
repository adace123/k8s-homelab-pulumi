import { traefik, vaultServer } from './modules/kubernetes/';

export = {
  traefik,
  vaultToken: vaultServer.credentials.root_token
};
