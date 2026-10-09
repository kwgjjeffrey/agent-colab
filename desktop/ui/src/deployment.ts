// Enterprise presentation is opt-in at build time; public builds retain account/org choices.
export const enterpriseDeployment = import.meta.env.VITE_COLAB_DEPLOYMENT_MODE === "enterprise";
