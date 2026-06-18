import { addons } from "storybook/manager-api";
import { ADDON_ID } from "./constants";

addons.register(ADDON_ID, () => {
  // The locale UI is contributed through preview globalTypes.
});
