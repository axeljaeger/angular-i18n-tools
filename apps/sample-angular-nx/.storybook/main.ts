import type { StorybookConfig } from "@storybook/angular-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.ts"],
  addons: ["@angular-i18n-tools/storybook-addon"],
  framework: {
    name: "@storybook/angular-vite",
    options: {}
  }
};

export default config;
