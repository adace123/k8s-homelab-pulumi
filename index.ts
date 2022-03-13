import * as pulumi from "@pulumi/pulumi";

// import { traefik, vaultServer } from './modules/kubernetes/';
import { argocd } from "./modules/kubernetes/argocd";
import { cluster } from "./modules/kubernetes/cluster";

export = {
  kubeconfig: pulumi.secret(cluster.kubeConfig),
  // vaultToken: vaultServer.credentials.root_token,
  argoCD: argocd
};
