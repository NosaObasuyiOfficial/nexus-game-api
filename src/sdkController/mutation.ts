import { Request, Response } from "express";
import dotenv from "dotenv";

import nexusBackendService from "../utils/service";

dotenv.config();
const { sdkApiKey, gatewayEmail, gatewayPassword, gatewayUrl, sdkBackendUrl } =
  process.env;

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

// .status = 200
export const registerGameResults = async (req: Request, res: Response) => {
  const obj = req.body;
  const { email, password, ...outcome } = obj;

  try {
    const payload = {
      email: gatewayEmail!,
      password: gatewayPassword!,
    };

    const gatewayAccess = await nexusBackendService.post(
      `${gatewayUrl}/nexus-wager/auth/login`,
      payload,
    );

    const loginCredentials = {
      email,
      password,
    };

    if (gatewayAccess.status === 200) {
      const userLogin = await nexusBackendService.post(
        `${gatewayUrl}/users/auth/login`,
        loginCredentials,
        {
          headers: {
            Authorization: `Bearer ${gatewayAccess.data.data.access_token}`,
          },
        },
      );

      if (userLogin.status === 200) {
        const userProfile = await nexusBackendService.get(
          `${gatewayUrl}/users/account/me`,
          {
            headers: {
              Authorization: `Bearer ${gatewayAccess.data.data.access_token}`,
              "X-APP-TOKEN": userLogin.data.data.token || "",
            },
          },
        );

        if (userProfile.status === 200) {
          const result = {
            ...outcome,
            developerId:
              userProfile.data.data[0].unique_id ||
              userProfile.data.data.unique_id,
          };

          console.log("result", result);

          // await nexusBackendService.post(`${sdkBackendUrl}/result`, result, {
          //   headers: {
          //     "sdk-api-key": sdkApiKey!,
          //   },
          // });

          res.status(200).json({
            success: true,
            message: "Result registered!",
          });
        } else {
          return res.status(400).json({
            success: false,
            message: "Failed to get user information",
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          message: "Failed to authenticate user",
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Failed to access nexus gateway",
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to register game result",
      errorMessage: error,
    });
  }
};
