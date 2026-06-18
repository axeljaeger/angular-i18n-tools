import type { StorybookConfig } from "@storybook/angular";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.ts"],
  addons: ["@angular-i18n-tools/storybook-addon"],
  framework: {
    name: "@storybook/angular",
    options: {}
  }
};

export default config;
