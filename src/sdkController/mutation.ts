import { Request, Response } from "express";
import dotenv from "dotenv";

import nexusBackendService from "../utils/service";

dotenv.config();
const { sdkApiKey, gatewayEmail, gatewayPassword, gatewayUrl, sdkBackendUrl } = process.env;

type POINTS = {
  playerId: string;
  point: number;
};

export type RESULT = {
  matchId: string;
  winningTeam: number;
  losingTeam: number;
  isDraw: boolean;
  outcomeReason: string;
  startedAt: string;
  endedAt: string;
  durationMs: string;
  roundsPlayed: number;
  playersPoints: POINTS[];
  additionalGameData: any;
};

export const registerGameResults = async (req: Request, res: Response) => {
  const obj = req.body;
  const { email, password, ...outcome } = obj;

      console.log("obj", obj)

  try {
    const payload = {
      email: email!,
      password: password!,
    };

    const gatewayAccess = await nexusBackendService.post(
      `${gatewayUrl}/nexus-wager/auth/login`,
      payload,
    );
      console.log("gatewayAccess", gatewayAccess)

    const loginCredentials = {
      email: gatewayEmail!,
      password: gatewayPassword!,
    };

    const userLogin = await nexusBackendService.post(
      `${gatewayUrl}/users/auth/login`,
      loginCredentials,
      {
        headers: {
          Authorization: `Bearer ${gatewayAccess.data.access_token}`,
          "sdk-api-key": sdkApiKey!,
        },
      },
    );

    console.log("userLogin", userLogin)

    const userProfile = await nexusBackendService.get(
      `${gatewayUrl}/users/account/me`,
      {
        headers: {
          Authorization: `Bearer ${gatewayAccess.data.access_token}`,
          "X-APP-TOKEN": userLogin.data.token || "",
          "sdk-api-key": sdkApiKey!,
        },
      },
    );


    const result = { ...outcome, developerId: userProfile.data[0].unique_id };

    await nexusBackendService.post(`${sdkBackendUrl}/result`, result, {
      headers: {
        "sdk-api-key": sdkApiKey!,
      },
    });

    res.status(200).json({
      success: true,
      message: "Result registered!",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to register game result",
      errorMessage: error,
    });
  }
};
