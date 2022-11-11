'use strict';
const axios = require('axios');
const env = require("./env");

exports.handler = async (event) => {
    // Dump the request for logging - check the CloudWatch logs
    console.log("----- index.handler request  -----");
    console.log(JSON.stringify(event));
    
    var token = event.headers["authorization"]
    
    if(!token) {
        return sendResponse({
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
                "Access-Control-Max-Age": "3600",
                "Access-Control-Allow-Headers": "Authorization, Origin, X-Requested-With, Content-Type, Accept, *"
            },
            "body": "HI"
        });
    }
    
    if (token.startsWith("Bearer ")) {
      token = token.substring(7)
    }
    
    var eventBody = JSON.parse(event.body);
    
    if(eventBody["action"] == 'offer') {
        const requestId = event.requestContext["requestId"]
        const deviceId = eventBody["deviceId"]
        const offer = eventBody["sdp"]
        let answerResponse = await handleWebrtc(requestId, deviceId, token, offer)
        return sendResponse(answerResponse);
    }else if (eventBody["action"] == 'end') {
        const requestId = event.requestContext["requestId"]
        const deviceId = eventBody["deviceId"]
        return sendResponse({});
    }
    
    const requestId = eventBody["requestId"]
    const intent = eventBody["inputs"][0]["intent"]
    const payload = eventBody["inputs"][0]["payload"]
    const agentUserId = getUserId(token)
    
    let jsonResponse = {
      "requestId": requestId
    };
    switch(intent) {
      case 'action.devices.SYNC':
        let googleDevices = await handleSync(requestId, token);
        jsonResponse = {
            "requestId": requestId,
            "payload": {
              "agentUserId": agentUserId,
              "devices": googleDevices
            }
        }
        break;
      case 'action.devices.QUERY':
        let serialNumbers = payload.devices.map(device=>device.id);
        let queryGoogleDevices = await handleQuery(requestId, token, serialNumbers);
        jsonResponse = {
            "requestId": requestId,
            "payload": {
              "devices": queryGoogleDevices
            }
        }
        break;
      case 'action.devices.EXECUTE':
        var commands = payload["commands"]
        commands.forEach(command => {
            let deviceId = command["devices"][0]["id"]
            let executionComamnd = command["execution"]["0"]["command"]
            
            if(executionComamnd == 'action.devices.commands.GetCameraStream') {
               var lambdaHost = "https://"+event.requestContext["domainName"]+event.requestContext["http"]["path"]
               jsonResponse = {
                    "requestId": requestId,
                    "payload": {
                        "commands": [{
                            "ids": [deviceId],
                            "status": 'SUCCESS',
                            "states": {
                                "cameraStreamProtocol": "webrtc",
                                "cameraStreamSignalingUrl": lambdaHost
                            }
                        }]
                    }
                }
            }
        })
        break;
      case 'action.devices.DISCONNECT':
        await handleDisconnect(requestId, token);
        break;
      default:
        break;
    }
    
    return sendResponse(jsonResponse);
};

async function handleSync(requestId, token) {
    console.info("handle sync requestId:", requestId);
    
    let accessToken = token;
    var envStr = getEnvStr(token);
  
    let iotServiceUrl = env.iotServiceUrlMap[envStr];
    if(!iotServiceUrl) {
        console.error('Can not find iotServiceUrl with env:', envStr);
        return null;
    };
    
    let oauthUrl = env.oauthUrlMap[envStr];
    if(!oauthUrl) {
        console.error('Can not find oauthUrl with env:', envStr);
        return null;
    };
    
    try {
        let response = await axios.post(oauthUrl+"/oauth/thirdparty/google/accountlinked", {}, {"headers":{"Authorization": "Bearer "+accessToken, "Content-Type": "application/json"}});
        // Dump the response for logging - check the CloudWatch logs
        console.log("---- index.handleSync google accountlinked response -----", response);
    
        // send alexaAccountLinkSuccess  
        await axios.post(iotServiceUrl+"/google/lambda/googleAccountLinkSuccess", {}, {"headers":{"Authorization": "Bearer "+accessToken, "Content-Type": "application/json"}});
    } catch(e) {};
    
    // query tenantName
    let tenantName = null;
    try{
        let queryTenantNameResponse = await axios.post(iotServiceUrl+"/user/querytenantnamebyuserId", {}, {"headers":{"Authorization": "Bearer "+accessToken, "Content-Type": "application/json"}});
        console.log("----- querytenantnamebyuserId ----- url:", iotServiceUrl, " response:", queryTenantNameResponse.data);
        if(queryTenantNameResponse.data.result !=0) {
            console.error('queryTenantNameResponse result!=0 msg:', queryTenantNameResponse.data.msg);
            return null;
        };
        tenantName = queryTenantNameResponse.data.data.tenantName
    } catch(e) {
    }
  
    // list platform linked devices
    let listplatformlinkeddevicesResponse = await axios.post(iotServiceUrl+"/device/listplatformlinkeddevices", {}, {"headers":{"Authorization": "Bearer "+accessToken, "Content-Type": "application/json"}});
    console.log("----- listplatformlinkeddevices ----- url:", iotServiceUrl, " response:", listplatformlinkeddevicesResponse.data);
    if(listplatformlinkeddevicesResponse.data.result !=0) {
        console.error('listplatformlinkeddevicesResponse result!=0 msg:', listplatformlinkeddevicesResponse.data.msg);
        return null;
    };
    
    let platformLinkedDevicesMap = listplatformlinkeddevicesResponse.data.data.platformLinkedDevicesMap || {};
    let deviceList = platformLinkedDevicesMap.googlehome || [];
    deviceList = deviceList.filter(v => {
        return (!v.codec) || v.codec.indexOf('h264') != -1;
    });
    
    let googleDevices = [];
    deviceList.forEach(device=>{
      googleDevices.push({
          id: device.serialNumber,
          type: "action.devices.types.CAMERA",
          traits: [
            "action.devices.traits.CameraStream",
            "action.devices.traits.ObjectDetection",
            "action.devices.traits.StatusReport",
            "action.devices.traits.OnOff"
          ],
          name: {
            defaultNames: [device.deviceName],
            name: device.deviceName,
            nicknames: [device.deviceName]
          },
          deviceInfo: {
            manufacturer: tenantName||device.deviceName,
            model: device.displayModelNo || device.modelNo,
            hwVersion: device.newestFirmwareId,
            swVersion: device.displayGitSha
          },
          attributes: {
            cameraStreamSupportedProtocols: ["webrtc"],
            cameraStreamNeedAuthToken: true,
            queryOnlyOnOff: true,
            commandOnlyOnOff: false
          },
          otherDeviceIds: [{
            deviceId: device.serialNumber
          }],
          willReportState: true,
          notificationSupportedByAgent: true
      });
    })
    return googleDevices;
}

async function handleQuery(requestId, token, serialNumbers) {
    console.info("handle query requestId:", requestId, " serialNumbers:", serialNumbers);
    
    let accessToken = token;
    var envStr = getEnvStr(token);
  
    let iotServiceUrl = env.iotServiceUrlMap[envStr];
    if(!iotServiceUrl) {
        console.error('Can not find iotServiceUrl with env:', envStr);
        return null;
    };
    
    let googleDevices = {};
    
    for (var i in serialNumbers) {
        let serialNumber =  serialNumbers[i];
        // get device state
        let deviceStateResponse = await axios.post(iotServiceUrl+"/device/selectsingledevice", {"serialNumber": serialNumber}, {"headers":{"Authorization": "Bearer "+accessToken, "Content-Type": "application/json"}});
        console.log("----- selectsingledevice ----- url:", iotServiceUrl, " response:", deviceStateResponse.data);
        if(deviceStateResponse.data.result !=0) {
            console.error('deviceStateResponse result!=0 msg:', deviceStateResponse.data.msg);
            continue;
        };
        
        let online = deviceStateResponse.data.data.online;
        let deviceStatus = deviceStateResponse.data.data.deviceStatus;
        
        googleDevices[serialNumber] = {
          "on": online == '0' ? false : deviceStatus == '3' ? false : true,
          "online": online == '0' ? false : deviceStatus == '3' ? false : true
        };
    };
    
    return googleDevices;
}

async function handleWebrtc(requestId, deviceId, token, offer) {
    console.info("handle webrtc requestId:", requestId, " deviceId:", deviceId, " offer:", offer);
    
    let accessToken = token;
    let iotSericeToken = getIotServiceToken(accessToken);
    var envStr = getEnvStr(token);
  
    let iotServiceUrl = env.iotServiceUrlMap[envStr];
    if(!iotServiceUrl) {
        console.error('Can not find iotServiceUrl with env:', envStr);
        return null;
    };
    
    // get webrtc ticket
    let viewerTicketResponse = await axios.post(iotServiceUrl+"/device/notAppGetWebrtcTicket", {"serialNumber": deviceId, "config": JSON.stringify({"sessionId": requestId, "devicePlatform": "googlehome"})}, {"headers":{"Authorization": "Bearer "+accessToken, "Content-Type": "application/json"}});
    console.log("----- notAppGetWebrtcTicket ----- url:", iotServiceUrl, " response:", viewerTicketResponse.data);
    console.log("iceserver:", viewerTicketResponse.data.data.iceServer)
    if(viewerTicketResponse.data.result !=0) {
        console.error('viewerTicketResponse result!=0 msg:', viewerTicketResponse.data.msg);
        return null;
    };

    let viewerTicket = viewerTicketResponse.data.data;
    let signalServerHost = viewerTicket.signalServer || '';
    signalServerHost = signalServerHost.indexOf('//')!=-1?signalServerHost.substring(signalServerHost.indexOf('//')+2):signalServerHost; 
    let signalServerIpAddress = viewerTicket.signalServerIpAddress;
    if(!signalServerHost && !signalServerIpAddress){
        console.error('viewerTicketResponse contains no signalServerHost and signalServerIpAddress');
        return null;
    };

    const sdpOffer = JSON.stringify({"type": "offer","sdp": offer});
    let alexaSdpOfferRequestBody = {
        "sdpOffer": sdpOffer,
        "viewerTicket": viewerTicket,
        "sessionId": requestId,
        "devicePlatform": "alexa"
    };

    console.info('request alexaSdpAnswer url:','https://'+(signalServerHost?signalServerHost:signalServerIpAddress)+"/api/getAlexaSdpAnswer")
    let alexaSdpAnswerResponse = await axios.post('https://'+(signalServerHost?signalServerHost:signalServerIpAddress)+"/api/getAlexaSdpAnswer", alexaSdpOfferRequestBody, {"headers":{"Authorization": "Bearer "+accessToken, "Content-Type": "application/json"}}).catch((error) =>{
        console.log("error: " + error);
      });
    console.info('alexaSdpAnswerResponse:', alexaSdpAnswerResponse)
    if(alexaSdpAnswerResponse.data.result !=0){
        console.error('alexaSdpAnswerResponse result!=0 msg:', alexaSdpAnswerResponse.data.msg);
        return null;
    };
    
    let sdpAnswer = alexaSdpAnswerResponse.data.data.sdp;
    return {
        "statusCode": 200,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
            "Access-Control-Max-Age": "3600",
            "Access-Control-Allow-Headers": "Authorization, Origin, X-Requested-With, Content-Type, Accept, *"
        },
        "body": JSON.stringify({
            "action": "answer",
            "sdp": sdpAnswer
        })
    };
}

async function handleDisconnect(requestId, token) {
    console.info("handle disconnect requestId:", requestId);
    
    let accessToken = token;
    var envStr = getEnvStr(token);
  
    let oauthUrl = env.oauthUrlMap[envStr];
    if(!oauthUrl) {
        console.error('Can not find oauthUrl with env:', envStr);
        return null;
    };
    
    let response = await axios.post(oauthUrl+"/oauth/thirdparty/google/accountDisconnect", {}, {"headers":{"Authorization": "Bearer "+accessToken, "Content-Type": "application/json"}});
    // Dump the response for logging - check the CloudWatch logs
    console.log("---- index.handleSync google accountDisconnect response -----", response);
}

// parse access_token
function getIotServiceToken(oauthAccessTokenBase64) {
    if(oauthAccessTokenBase64.indexOf('Basic') == 0) {
        oauthAccessTokenBase64 = oauthAccessTokenBase64.substring(5);
    }
    let oauthAccessToken = Buffer.from(oauthAccessTokenBase64, 'base64').toString('utf8');
    let iotSericeTokenWithEnvStrs = /\"jti\":\"[0-9a-zA-Z=+/]*\"/.exec(oauthAccessToken)[0].split('"');
    let iotSericeTokenWithEnvBase64 = iotSericeTokenWithEnvStrs.find((v=>v.length>10));
    let iotSericeTokenWithEnv = Buffer.from(iotSericeTokenWithEnvBase64, 'base64').toString('utf8');
    let envStr = iotSericeTokenWithEnv.substring(0, iotSericeTokenWithEnv.indexOf("_"));
    let iotSericeToken = iotSericeTokenWithEnv.substr(envStr.length+1);
    return iotSericeToken
}

function getEnvStr(oauthAccessTokenBase64) {
    if(oauthAccessTokenBase64.indexOf('Basic') == 0) {
        oauthAccessTokenBase64 = oauthAccessTokenBase64.substring(5);
    }
    let oauthAccessToken = Buffer.from(oauthAccessTokenBase64, 'base64').toString('utf8');
    let iotSericeTokenWithEnvStrs = /\"jti\":\"[0-9a-zA-Z=+/]*\"/.exec(oauthAccessToken)[0].split('"');
    let iotSericeTokenWithEnvBase64 = iotSericeTokenWithEnvStrs.find((v=>v.length>10));
    let iotSericeTokenWithEnv = Buffer.from(iotSericeTokenWithEnvBase64, 'base64').toString('utf8');
    let envStr = iotSericeTokenWithEnv.substring(0, iotSericeTokenWithEnv.indexOf("_"));
    return envStr;
}

function getUserId(oauthAccessTokenBase64) {
    if(oauthAccessTokenBase64.indexOf('Basic') == 0) {
        oauthAccessTokenBase64 = oauthAccessTokenBase64.substring(5);
    }
    let oauthAccessToken = Buffer.from(oauthAccessTokenBase64, 'base64').toString('utf8');
    let userNameStrs = /\"user_name\":\"[0-9a-zA-Z-=+/]*\"/.exec(oauthAccessToken)[0].split('"');
    let userName = userNameStrs.find((v=>v!="user_name" && v.trim().length>1));
    return userName;
}

function sendResponse(response) {
    console.log("----- index.sendResponse -----");
    console.log(JSON.stringify(response));
    return response
}