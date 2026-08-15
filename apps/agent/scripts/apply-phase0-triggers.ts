import { db } from "@crm/db";
import { applyPhase0LifecycleEventTriggers } from "../agent/lib/autonomy-policy";

const changed = await applyPhase0LifecycleEventTriggers(db);
console.log(`phase0 event triggers adjusted: ${changed}`);
await db.$disconnect();
