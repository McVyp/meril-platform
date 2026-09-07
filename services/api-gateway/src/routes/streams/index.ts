import { Router } from "express";
import { browserRouter } from "./browser";
import { chatRouter } from "./chat";
import { lifecycleRouter } from "./lifeCycle";
import { webhooksRouter } from "./webhooks";
import { mobileRouter } from "./mobile";

export const streamRouter = Router();

streamRouter.use(browserRouter);
streamRouter.use(chatRouter);
streamRouter.use(lifecycleRouter);
streamRouter.use(webhooksRouter);
streamRouter.use(mobileRouter);
