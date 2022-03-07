import { provider } from '../cluster';
import * as k8s from '@pulumi/kubernetes';

export const traefik = new k8s.helm.v3.Release(
  'traefik',
  {
    chart: 'traefik',
    name: 'traefik',
    version: '10.14.2',
    namespace: 'traefik',
    createNamespace: true,
    repositoryOpts: {
      repo: 'https://helm.traefik.io/traefik'
    },
    values: {
      service: {
        type: 'NodePort',
        annotations: {
          'pulumi.com/skipAwait': 'true'
        }
      },
      ports: {
        web: {
          port: 8000,
          nodePort: 32500
        }
      },
      providers: {
        kubernetesIngress: {
          publishedService: {
            enabled: true
          }
        }
      }
    }
  },
  { provider, parent: provider }
);

const traefikDashboardService = new k8s.core.v1.Service(
  'traefik-dashboard-service',
  {
    metadata: {
      name: 'traefik-dashboard',
      namespace: 'traefik',
      annotations: {
        'pulumi.com/skipAwait': 'true'
      }
    },
    spec: {
      selector: {
        'app.kubernetes.io/name': 'traefik'
      },
      ports: [
        {
          port: 9000,
          targetPort: 9000
        }
      ]
    }
  },
  { provider, parent: traefik }
);

const traefikIngress = new k8s.networking.v1.Ingress(
  'traefik-dashboard-ingress',
  {
    metadata: {
      name: 'traefik-dashboard',
      namespace: 'traefik',
      annotations: {
        // Workaround for https://github.com/pulumi/pulumi-kubernetes/issues/1812
        'pulumi.com/skipAwait': 'true'
      }
    },
    spec: {
      rules: [
        {
          host: 'traefik.local.k8s',
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: {
                    name: traefikDashboardService.metadata.name,
                    port: {
                      number: 9000
                    }
                  }
                }
              }
            ]
          }
        }
      ]
    }
  },
  { provider, parent: traefik }
);
