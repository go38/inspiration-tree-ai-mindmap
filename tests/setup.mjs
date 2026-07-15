// Registers the module-customization hooks before the test files load.
// Used via `node --import ./tests/setup.mjs --test`.
import { register } from "node:module";

register("./hooks.mjs", import.meta.url);
