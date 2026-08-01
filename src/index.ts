import express from "express";
import dotenv from "dotenv";
import logger from "morgan";
import cors from "cors";
import sdkRoutes from "./routes/sdk_routes";
// import { sdkApiKeyMiddleware } from "./middleware/sdkApiKey";

dotenv.config();

const { PORT } = process.env;
const app = express();

app.use(cors());
app.use(express.json());
app.use(logger("dev"));
app.use(express.urlencoded({ extended: false }));

// app.use("/sdk", sdkApiKeyMiddleware, sdkRoutes);
app.use("/", sdkRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
