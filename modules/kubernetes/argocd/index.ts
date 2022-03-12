import * as k8s from '@pulumi/kubernetes';
import { resolve } from 'path';

import { provider } from '../cluster';

const argocd = new k8s.helm.v3.Release(
  'argocd',
  {
    name: 'argocd',
    namespace: 'argocd',
    repositoryOpts: {
      repo: 'https://argoproj.github.io/argo-helm'
    },
    chart: 'argo-cd',
    createNamespace: true
  },
  { provider }
);

export const argoCDRootApp = new k8s.yaml.ConfigFile(
  'argocd-root-app',
  {
    file: `${resolve('.')}/apps/argocd/root.yaml`
  },
  { provider, dependsOn: [argocd], parent: provider }
);
