import { local } from '@pulumi/command';
import * as k8s from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import * as vault from '@pulumi/vault';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import * as yaml from 'yaml';

import { cluster, provider } from '../cluster';
import {
  K8SPolicyConfig,
  K8SRoleConfig,
  VaultAddons,
  VaultRootCredentials
} from './types';

interface VaultServerInputs {
  keyShares: pulumi.Input<number>;
  keyThreshold: pulumi.Input<number>;
  ingressHost: pulumi.Input<string>;
  ingressPort: pulumi.Input<number>;
  addons?: pulumi.Input<Array<VaultAddons>>;
  credentialsOutputPath?: pulumi.Input<string>;
}

export class K8SVaultServer extends pulumi.ComponentResource {
  public credentials!: pulumi.Output<VaultRootCredentials>;
  private provider!: vault.Provider;

  initializeVault(inputs: VaultServerInputs) {
    const injectionEnabled = (inputs.addons as Array<VaultAddons>).includes(
      VaultAddons.Sidecar
    );
    const release = this.createHelmRelease(injectionEnabled);
    const ingressUrl = `http://${inputs.ingressHost}:${inputs.ingressPort}`;

    const setupVaultcommand = new local.Command(
      'vault-init-command',
      {
        create: `${resolve('.')}/modules/kubernetes/vault/run_vault_script.sh`,
        environment: {
          KUBECONFIG: cluster.kubeConfigPath,
          KUBECONTEXT: cluster.kubeContext,
          VAULT_KEY_SHARES: inputs.keyShares.toString(),
          VAULT_KEY_THRESHOLD: inputs.keyThreshold.toString(),
          VAULT_INGRESS_URL: ingressUrl,
          COMMAND: 'npx ts-node ./modules/kubernetes/vault/setup_vault.ts'
        }
      },
      { dependsOn: [release], parent: release }
    );

    this.credentials = setupVaultcommand.stdout.apply((_) => {
      let credentials = {};
      if (existsSync('./vault.json')) {
        const vaultFileContents = readFileSync('./vault.json').toString();
        credentials = JSON.parse(vaultFileContents) as VaultRootCredentials;
      }
      return pulumi.secret(credentials as VaultRootCredentials);
    });

    this.provider = new vault.Provider('k8s-vault-provider', {
      token: this.credentials.root_token,
      address: ingressUrl
    });

    const kvv2 = new vault.Mount(
      'kv-v2-secrets-engine',
      {
        path: 'secret',
        type: 'kv-v2'
      },
      { provider: this.provider }
    );

    const audit = new vault.Audit(
      'vault-audit',
      {
        type: 'file',
        options: {
          path: '/vault/logs/vault.log'
        }
      },
      { provider: this.provider }
    );
  }

  createHelmRelease(enableInjection: boolean = true): k8s.helm.v3.Release {
    return new k8s.helm.v3.Release(
      'vault',
      {
        chart: 'vault',
        version: '0.19.0',
        namespace: 'vault',
        name: 'vault',
        skipAwait: true, // Vault pod will not pass readiness probe until server is initialized and unsealed
        createNamespace: true,
        repositoryOpts: {
          repo: 'https://helm.releases.hashicorp.com'
        },
        values: {
          server: {
            serviceAccount: {
              name: 'vault'
            },
            injector: {
              enabled: enableInjection
            },
            ingress: {
              enabled: true,
              annotations: {
                // Workaround for https://github.com/pulumi/pulumi-kubernetes/issues/1812
                'pulumi.com/skipAwait': 'true'
              },
              hosts: [
                {
                  host: 'vault.k8s.local',
                  path: '/'
                }
              ]
            }
          }
        }
      },
      { provider, parent: this }
    );
  }

  setupVaultInjection(inputs: VaultServerInputs) {
    const ingressUrl = `http://${inputs.ingressHost}:${inputs.ingressPort}`;

    const serviceAccountToken = new local.Command(
      'vault-service-account-token',
      {
        create: `${resolve('.')}/modules/kubernetes/vault/run_vault_script.sh`,
        environment: {
          COMMAND: `kubectl exec -it -n vault vault-0 -- cat /var/run/secrets/kubernetes.io/serviceaccount/token`,
          KUBECONFIG: cluster.kubeConfigPath,
          VAULT_INGRESS_URL: ingressUrl
        }
      }
    );

    const caCert = new local.Command('vault-ca-cert', {
      create: `${resolve('.')}/modules/kubernetes/vault/run_vault_script.sh`,
      environment: {
        COMMAND: `kubectl exec -it -n vault vault-0 -- cat /var/run/secrets/kubernetes.io/serviceaccount/ca.crt`,
        KUBECONFIG: cluster.kubeConfigPath,
        VAULT_INGRESS_URL: ingressUrl
      }
    });
    const policyResources: Array<vault.Policy> = [];

    const policies = yaml.parse(
      readFileSync(
        `${resolve('.')}/modules/kubernetes/vault/policies.yaml`
      ).toString()
    ) as Array<K8SPolicyConfig>;

    for (const { name, policy } of policies) {
      const policyResource = new vault.Policy(
        name,
        {
          name,
          policy
        },
        { provider: this.provider }
      );
      policyResources.push(policyResource);
    }

    const k8sAuthBackend = new vault.AuthBackend(
      'kubernetes-auth-backend',
      {
        type: 'kubernetes',
        path: pulumi.interpolate`k8s-${cluster.kubeContext}`
      },
      { provider: this.provider }
    );

    const k8sAuthBackendConfig = new vault.kubernetes.AuthBackendConfig(
      'kubernetes-auth-backend-config',
      {
        backend: k8sAuthBackend.path,
        kubernetesHost: 'https://kubernetes.default.svc.cluster.local:443',
        tokenReviewerJwt: serviceAccountToken.stdout,
        kubernetesCaCert: caCert.stdout,
        issuer: 'https://kubernetes.default.svc.cluster.local'
      },
      { provider: this.provider }
    );

    const roles = yaml.parse(
      readFileSync(
        `${resolve('.')}/modules/kubernetes/vault/roles.yaml`
      ).toString()
    ) as Array<K8SRoleConfig>;

    for (const role of roles) {
      const roleResource = new vault.kubernetes.AuthBackendRole(
        role.name,
        {
          backend: k8sAuthBackend.path,
          roleName: role.name,
          tokenPolicies: role.policies,
          boundServiceAccountNamespaces: role.namespaces || ['*'],
          boundServiceAccountNames: role.serviceAccounts || ['*']
        },
        { dependsOn: policyResources, provider: this.provider }
      );
    }
  }

  setupAddons(inputs: VaultServerInputs) {
    for (const addon of new Set(inputs.addons as VaultAddons[])) {
      switch (addon) {
        case VaultAddons.Sidecar:
          this.setupVaultInjection(inputs);
          break;
        default:
          throw new Error(`${addon} is not a support Vault addon!`);
      }
    }
  }

  constructor(
    name: string,
    inputs: VaultServerInputs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super('vault-k8s-server', name, {}, opts);
    this.initializeVault(inputs);

    if (inputs.addons) {
      this.setupAddons(inputs);
    }
  }
}
