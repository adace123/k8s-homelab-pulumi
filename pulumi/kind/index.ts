

import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

import { KindCluster } from "./cluster";

const config = new pulumi.Config("kind");
const clusterName = config.get("cluster-name") || "pulumi";
export const cluster = new KindCluster(clusterName, {
  clusterName,
});

export const provider = new k8s.Provider(
  "kind-k8s-provider",
  {
    kubeconfig: cluster.kubeConfig,
    context: cluster.kubeContext
  },
  {
    dependsOn: [cluster],
    parent: cluster
  }
);
