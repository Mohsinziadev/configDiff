import { compareConfigs } from "configdiff-js";

compareConfigs({ b: 2, a: 1 }, { a: 1, b: 2 }); // no changes: key order is not a change
compareConfigs({ port: "3000" }, { port: 3000 }); // modified port: string became number
compareConfigs({ l: [1, 2] }, { l: [2, 1] }); // l[0] and l[1] modified: arrays are ordered
compareConfigs({ l: [1, 2] }, { l: [2, 1] }, { unordered: ["l"] }); // no changes
