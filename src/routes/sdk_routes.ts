import express from "express";
import { registerGameResults } from "../sdkController/mutation";

const router = express.Router();

router.post("/game/outcome", registerGameResults);

export default router;
