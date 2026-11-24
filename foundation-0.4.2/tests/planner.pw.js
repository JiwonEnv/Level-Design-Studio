import {test} from '@playwright/test';
import {verifyLevelWorkflow} from './level-workflow.js';
test('image calibration, free planner geometry, preview/apply and override-safe partial regeneration',async({page})=>{await verifyLevelWorkflow(page);});
