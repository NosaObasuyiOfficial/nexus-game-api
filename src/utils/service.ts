import axios from "axios";

const nexusBackendService = axios.create({
  headers: {
    "Content-Type": "application/json",
  },
});

export default nexusBackendService;