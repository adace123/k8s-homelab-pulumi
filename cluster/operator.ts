import * as k8s from "@pulumi/kubernetes";

import { clusterProvider } from "./provider";

const crds = new k8s.yaml.ConfigFile(
  "crds",
  {
    file: "https://raw.githubusercontent.com/pulumi/pulumi-k8s-operator/v1.5.0/deploy/crds/pulumi.com_stacks.yaml"
  },
  { provider: clusterProvider }
);
const operatorServiceAccount = new k8s.core.v1.ServiceAccount(
  "operator-service-account",
  {},
  { provider: clusterProvider }
);
const operatorRole = new k8s.rbac.v1.Role(
  "operator-role",
  {
    rules: [
      {
        apiGroups: [""],
        resources: [
          "pods",
          "services",
          "services/finalizers",
          "endpoints",
          "persistentvolumeclaims",
          "events",
          "configmaps",
          "secrets"
        ],
        verbs: ["create", "delete", "get", "list", "patch", "update", "watch"]
      },
      {
        apiGroups: ["apps"],
        resources: ["deployments", "daemonsets", "replicasets", "statefulsets"],
        verbs: ["create", "delete", "get", "list", "patch", "update", "watch"]
      },
      {
        apiGroups: ["monitoring.coreos.com"],
        resources: ["servicemonitors"],
        verbs: ["create", "get"]
      },
      {
        apiGroups: ["apps"],
        resourceNames: ["pulumi-k8s-operator"],
        resources: ["deployments/finalizers"],
        verbs: ["update"]
      },
      {
        apiGroups: [""],
        resources: ["pods"],
        verbs: ["get"]
      },
      {
        apiGroups: ["apps"],
        resources: ["replicasets", "deployments"],
        verbs: ["get"]
      },
      {
        apiGroups: ["pulumi.com"],
        resources: ["*"],
        verbs: ["create", "delete", "get", "list", "patch", "update", "watch"]
      },
      {
        apiGroups: ["coordination.k8s.io"],
        resources: ["leases"],
        verbs: ["create", "get", "list", "update"]
      }
    ]
  },
  { provider: clusterProvider }
);

const operatorRoleBinding = new k8s.rbac.v1.RoleBinding(
  "operator-role-binding",
  {
    subjects: [
      {
        kind: "ServiceAccount",
        name: operatorServiceAccount.metadata.name
      }
    ],
    roleRef: {
      kind: "Role",
      name: operatorRole.metadata.name,
      apiGroup: "rbac.authorization.k8s.io"
    }
  },
  { provider: clusterProvider }
);

export const operatorDeployment = new k8s.apps.v1.Deployment(
  "pulumi-k8s-operator",
  {
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          name: "pulumi-k8s-operator"
        }
      },
      template: {
        metadata: {
          labels: {
            name: "pulumi-k8s-operator"
          }
        },
        spec: {
          serviceAccountName: operatorServiceAccount.metadata.name,
          containers: [
            {
              name: "pulumi-k8s-operator",
              image: "pulumi/pulumi-k8s-operator:v1.5.0",
              args: ["--zap-level=error", "--zap-time-encoding=iso8601"],
              imagePullPolicy: "Always",
              env: [
                {
                  name: "WATCH_NAMESPACE",
                  valueFrom: {
                    fieldRef: {
                      fieldPath: "metadata.namespace"
                    }
                  }
                },
                {
                  name: "POD_NAME",
                  valueFrom: {
                    fieldRef: {
                      fieldPath: "metadata.name"
                    }
                  }
                },
                {
                  name: "OPERATOR_NAME",
                  value: "pulumi-k8s-operator"
                },
                {
                  name: "GRACEFUL_SHUTDOWN_TIMEOUT_DURATION",
                  value: "5m"
                },
                {
                  name: "MAX_CONCURRENT_RECONCILES",
                  value: "10"
                }
              ]
            }
          ],
          // Should be same or larger than GRACEFUL_SHUTDOWN_TIMEOUT_DURATION
          terminationGracePeriodSeconds: 300
        }
      }
    }
  },
  { dependsOn: crds, provider: clusterProvider }
);
