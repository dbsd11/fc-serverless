// -*- coding: utf-8 -*-

'use strict';
const axios = require('axios');
const AlexaResponse = require("./AlexaResponse");
const env = require("./env");

exports.handler = async function (event, context) {
    // Dump the request for logging - check the CloudWatch logs
    console.log("----- index.handler request  -----");
    console.log(JSON.stringify(event));

    // Dump the context for logging - check the CloudWatch logs
    if (context !== undefined) {
        console.log("----- index.handler context  -----");
        console.log(JSON.stringify(context));
    }
    // Validate we have an Alexa directive
    if (!('directive' in event)) {
        const aer = new AlexaResponse({
            "name": "ErrorResponse",
            "payload": {
                "type": "INVALID_DIRECTIVE",
                "message": "Missing key: directive, Is request a valid Alexa directive?"
            }
        });
        return sendResponse(aer.get());
    }
    // Check the payload version
    if (event.directive.header.payloadVersion !== "3") {
        const aer = new AlexaResponse({
            "name": "ErrorResponse",
            "payload": {
                "type": "INTERNAL_ERROR",
                "message": "This skill only supports Smart Home API version 3"
            }
        });
        return sendResponse(aer.get())
    }
    // Get directive namespace
    const namespace = (((event.directive || {}).header || {}).namespace || {}).toLowerCase();

    let jsonResponse;
    // Manage directives
    switch (namespace) {
        case 'alexa.authorization':
            await handleAcceptGrant(event);
            jsonResponse = new AlexaResponse({
                "namespace": "Alexa.Authorization",
                "name": "AcceptGrant.Response"
            }).get();
            break;
        case 'alexa.discovery':
            jsonResponse = await handleDiscovery(event);
            break;
        case 'alexa.rtcsessioncontroller':
            jsonResponse = await handleWebRtc(event);
            break;
        case 'alexa':
            jsonResponse = await handleAlexa(event);
            break;
        default:
            jsonResponse = new AlexaResponse({
                "name": "ErrorResponse",
                "payload": {
                    "type": "INVALID_DIRECTIVE",
                    "message": namespace + "is NOT a capability handled by the Skill"
                }
            }).get();
            break;
    }
    // Return JSON Response
    return sendResponse(jsonResponse);
};

function sendResponse(response) {
    console.log("----- index.sendResponse -----");
    console.log(JSON.stringify(response));
    return response
}

async function handleDiscovery(event) {
    console.log("----- index.handleDiscovery -----");

    let accessToken = event.directive.payload.scope.token;
    let envStr = getEnvStr(event.directive.payload.scope.token);
    
    let iotServiceUrl = env.iotServiceUrlMap[envStr];
    if(!iotServiceUrl) {
        console.error('Can not find iotServiceUrl with env:', envStr);
        return null;
    };

    // query tenantName
    let tenantName = null;
    try{
        let queryTenantNameResponse = await axios.post(iotServiceUrl+"/user/querytenantnamebyuserId", {}, {"headers":{"Authorization": "Bearer "+accessToken, "Content-Type": "application/json"}});
        console.log("----- querytenantnamebyuserId ----- url:", iotServiceUrl, " response:", queryTenantNameResponse.data);
        if(queryTenantNameResponse.data.result !=0) {
            console.error('queryTenantNameResponse result!=0 msg:', queryTenantNameResponse.data.msg);
        } else {
            tenantName = queryTenantNameResponse.data.data.tenantName
        }
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
    let deviceList = platformLinkedDevicesMap.alexa || [];
    deviceList = deviceList.filter(v => {
        return (!v.codec) || v.codec.indexOf('h264') != -1;
    });

    //create response
    let adr = new AlexaResponse({
        "namespace": "Alexa.Discovery",
        "name": "Discover.Response"
    });

    // commom capability
    let capability_alexa = adr.createPayloadEndpointCapability();
    // webrtc capability
    let capability_alexa_webrtc = adr.createPayloadEndpointCapability({
        "interface": "Alexa.RTCSessionController",
        "configuration": {
            "isFullDuplexAudioSupported": true
        }
    });
    // doorbell capability
    let capability_alexa_doorbell = adr.createPayloadEndpointCapability({
        "interface": "Alexa.DoorbellEventSource",
        "proactivelyReported": true,
        "retrievable": false
    });
    // state report capability
    let capability_alexa_endpointHealth = adr.createPayloadEndpointCapability({
        "interface": "Alexa.EndpointHealth",
        "supported": [
            {
              "name":"connectivity"
            }
          ],
        "proactivelyReported": true,
        "retrievable": true
    });
    let capability_alexa_endpointHealth_withBattery = adr.createPayloadEndpointCapability({
        "interface": "Alexa.EndpointHealth",
        "supported": [
            {
              "name":"connectivity"
            },
            {
              "name":"battery"
            }
          ],
        "proactivelyReported": true,
        "retrievable": true
    });

    let capability_alexa_motion_sensor = adr.createPayloadEndpointCapability({
        "interface": "Alexa.MotionSensor",
        "supported": [
            {
              "name":"detectionState"
            }
          ],
        "proactivelyReported": true,
        "retrievable": false
    });

    deviceList.forEach(device=>{
        var isDoorbell = device.modelNo.startsWith('DB')
        var isBatteryDevice = true

        // define device appliance
        adr.addPayloadEndpoint({
            "friendlyName": device.deviceName, // Note: can be renamed in Alexa App after discovery
            "description": isDoorbell ? "Video Doorbell" : "Smart Camera",
            "manufacturerName": tenantName||device.deviceName,
            "endpointId": device.serialNumber,
            "displayCategories": ["CAMERA", device.displayModelNo || device.modelNo], // Note: Alexa App Icon Category corresponds to first item of this array
            "capabilities": isDoorbell ? [
                capability_alexa,
                capability_alexa_webrtc,
                isBatteryDevice ? capability_alexa_endpointHealth_withBattery : capability_alexa_endpointHealth,
                capability_alexa_motion_sensor,
                capability_alexa_doorbell
            ] : [
                capability_alexa,
                capability_alexa_webrtc,
                isBatteryDevice ? capability_alexa_endpointHealth_withBattery : capability_alexa_endpointHealth,
                capability_alexa_motion_sensor
            ],
            "additionalAttributes": {
                "manufacturer" : tenantName||device.deviceName,
                "endpointId": device.serialNumber,
                "model" : device.displayModelNo || device.modelNo,
                "serialNumber": device.serialNumber,
                "firmwareVersion" : device.newestFirmwareId,
                "softwareVersion": device.displayGitSha,
                "customIdentifier": device.macAddress
            }
        });        
    });
    
    return adr.get();
}

async function handleAcceptGrant(event) {
    console.log("----- index.handleAcceptGrant -----");

    let accessToken = event.directive.payload.grantee.token;
    let envStr = getEnvStr(event.directive.payload.grantee.token);

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

    let acceptGrantCode = event.directive.payload.grant.code;

    let response = await axios.post(oauthUrl+`/oauth/thirdparty/amazon/authorization?code=${acceptGrantCode}`, {"alexa-eventgateway-endpoint": env.alexaEventGatewayEndpoint}, {"headers":{"Authorization": "Bearer "+accessToken, "Content-Type": "application/json"}});
    // Dump the response for logging - check the CloudWatch logs
    console.log("---- index.handleAcceptGrant : response -----");

    try {
        // send alexaAccountLinkSuccess  
        await axios.post(iotServiceUrl+"/alexa/lambda/alexaAccountLinkSuccess", {}, {"headers":{"Authorization": "Bearer "+accessToken, "Content-Type": "application/json"}});
    } catch(e) {};

    console.log(response.data);
}

async function handleWebRtc(event) {
    console.log("----- index.handleWebRtc -----", event);
    const directive = event.directive.header.name;
    const endpointId = event.directive.endpoint.endpointId;
    const token = event.directive.endpoint.scope.token;
    const correlationToken = event.directive.header.correlationToken;
    const sessionId = event.directive.payload.sessionId;
    let jsonResponse;
    switch (directive) {
        case 'InitiateSessionWithOffer':
            console.log('--- WebRtc | InitiateSessionWithOffer ---');
            // check battery level
            let deviceStateObj = await getDeviceState(event);
            if(deviceStateObj == null || (deviceStateObj['batteryLevel'] >= 0 && deviceStateObj['batteryLevel'] < 10)) {
                return new AlexaResponse({
                    "namespace": "Alexa",
                    "name": "ErrorResponse",
                    "correlationToken": correlationToken,
                    "token": token,
                    "endpointId": endpointId,
                    "payload": {
                        "type": deviceStateObj == null ? "ENDPOINT_UNREACHABLE" : "ENDPOINT_LOW_POWER",
                        "message": "The cameara battery is low"
                      }
                    }).get();
            }

            // Call Signaling Server
            const sdpAnswer = await getSDPAnswer(event);
            // Generate response with SDP Answer from Signaling Server
            jsonResponse = new AlexaResponse({
                "namespace": "Alexa.RTCSessionController",
                "name": "AnswerGeneratedForSession",
                "correlationToken": correlationToken,
                "token": token,
                "endpointId": endpointId,
                "payload": {
                    "answer": {
                        "format": "SDP",
                        "value": sdpAnswer
                    }
                }
            }).get();
            break;
        case 'SessionConnected':
            console.log('--- WebRtc | SessionConnected ---');

            await sendSessionConnected(event);

            jsonResponse = new AlexaResponse({
                "namespace": "Alexa.RTCSessionController",
                "name": "SessionConnected",
                "correlationToken": correlationToken,
                "token": token,
                "endpointId": endpointId,
                "payload": {
                    "sessionId": sessionId
                }
            }).get();
            break;
        case 'SessionDisconnected':
            console.log('--- WebRtc | SessionDisconnected ---');

            await sendSessionDisconnected(event);

            jsonResponse = new AlexaResponse({
                "namespace": "Alexa.RTCSessionController",
                "name": "SessionDisconnected",
                "correlationToken": correlationToken,
                "token": token,
                "endpointId": endpointId,
                "payload": {
                    "sessionId": sessionId
                }
            }).get();
            break;
        default:
            console.log('--- WebRtc | Default ---');
            jsonResponse = new AlexaResponse({
                "name": "ErrorResponse",
                "payload": {
                    "type": "INVALID_DIRECTIVE",
                    "message": directive + "is NOT a directive handled by the Skill"
                }
            }).get();;
            break;
    }
    return jsonResponse;
}

async function handleAlexa(event) {
    console.log("----- index.handleAlexa -----", event);
    const directive = event.directive.header.name;
    const endpointId = event.directive.endpoint.endpointId;
    const token = event.directive.endpoint.scope.token;
    const correlationToken = event.directive.header.correlationToken;
    let jsonResponse;
    switch (directive) {
        case 'ReportState':
            console.log('--- Alexa | ReportState ---');

            let deviceStateObj = await getDeviceState(event);
        
            jsonResponse = new AlexaResponse({
                "namespace": "Alexa",
                "name": "StateReport",
                "correlationToken": correlationToken,
                "token": token,
                "endpointId": endpointId,
                "payload": {}
            }).get();
            if (deviceStateObj != null) {
                jsonResponse.context = {
                    "properties": [jsonResponse.createContextProperty({
                        "namespace": "Alexa.EndpointHealth",
                        "name": "connectivity",
                        "value": {
                            "value": deviceStateObj.deviceState
                        },
                    }), jsonResponse.createContextProperty({
                        "namespace": "Alexa.EndpointHealth",
                        "name": "battery",
                        "value": {
                            "health": (deviceStateObj.batteryLevel >= 10 || deviceStateObj.batteryLevel < 0) ? {
                                "state": "OK"
                            } : {
                                "state": "WARNING",
                                "reasons": ["LOW_CHARGE"]
                            },
                            "levelPercentage": deviceStateObj.batteryLevel
                        },
                    })]
                };
            }
            break;
        default:
            console.log('--- Alexa | Default ---');
            jsonResponse = new AlexaResponse({
                "name": "ErrorResponse",
                "payload": {
                    "type": "INVALID_DIRECTIVE",
                    "message": directive + "is NOT a directive handled by the Skill"
                }
            }).get();;
            break;
    };
    return jsonResponse;
}

async function getSDPAnswer(event) {
    console.log("----- index.getSDPAnswer -----");
    
    // Alexa SDP Offer
    const sdpOffer = JSON.stringify({"type": "offer","sdp": event.directive.payload.offer.value});
    console.log("----- getSDPAnswer input offer ----- ", sdpOffer);
    
    let accessToken = event.directive.endpoint.scope.token;
    let iotSericeToken = getIotServiceToken(accessToken);
    let envStr = getEnvStr(event.directive.endpoint.scope.token);
    
    let iotServiceUrl = env.iotServiceUrlMap[envStr];
    if(!iotServiceUrl) {
        console.error('Can not find iotServiceUrl with env:', envStr);
        return null;
    };

    // get webrtc ticket
    let viewerTicketResponse = await axios.post(iotServiceUrl+"/device/notAppGetWebrtcTicket", {"serialNumber": event.directive.endpoint.endpointId, "alexaConfig": JSON.stringify({"sessionId": event.directive.payload.sessionId}), "config": JSON.stringify({"devicePlatform": "alexa", "sessionId": event.directive.payload.sessionId})}, {"headers":{"Authorization": "Bearer "+accessToken, "Content-Type": "application/json"}});
    console.log("----- notAppGetWebrtcTicket ----- url:", iotServiceUrl, " response:", viewerTicketResponse.data);
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

    let alexaSdpOfferRequestBody = {
        "sdpOffer": sdpOffer,
        "viewerTicket": viewerTicket,
        "sessionId": event.directive.payload.sessionId,
        "devicePlatform": "alexa"
    };

    console.info('request alexaSdpAnswer url:','https://'+(signalServerHost?signalServerHost:signalServerIpAddress)+"/api/getAlexaSdpAnswer")
    let alexaSdpAnswerResponse = await axios.post('https://'+(signalServerHost?signalServerHost:signalServerIpAddress)+"/api/getAlexaSdpAnswer", alexaSdpOfferRequestBody, {"headers":{"Authorization": "Bearer "+iotSericeToken, "Content-Type": "application/json"}}).catch((error) =>{
        console.log("error: " + error);
      });
    console.info('alexaSdpAnswerResponse:', alexaSdpAnswerResponse)
    if(alexaSdpAnswerResponse.data.result !=0){
        console.error('alexaSdpAnswerResponse result!=0 msg:', alexaSdpAnswerResponse.data.msg);
        return null;
    };

    try {
        // send report live alexaSdpReturnAnswer 
        let response = await axios.post(iotServiceUrl+"/report/live/alexaSdpReturnAnswer", {"liveId": "alexa_"+event.directive.payload.sessionId, "serialNumber": event.directive.endpoint.endpointId}, {"headers":{"Authorization": "Bearer "+accessToken, "Content-Type": "application/json"}});
        console.log("----- alexaSdpReturnAnswer ----- url:", iotServiceUrl, " response:", response.data);
    } catch(e) {};
    
    let sdpAnswer = alexaSdpAnswerResponse.data.data.sdp;
    return sdpAnswer;
}

async function sendSessionConnected(event){
    console.log("----- index.sendSessionConnected -----");

    let accessToken = event.directive.endpoint.scope.token;
    let envStr = getEnvStr(event.directive.endpoint.scope.token);
    
    let iotServiceUrl = env.iotServiceUrlMap[envStr];
    if(!iotServiceUrl) {
        console.error('Can not find iotServiceUrl with env:', envStr);
        return null;
    };

    // send report live alexaSessionDisconnected 
    let response = await axios.post(iotServiceUrl+"/report/live/alexaSessionConnected", {"liveId": "alexa_"+event.directive.payload.sessionId, "serialNumber": event.directive.endpoint.endpointId}, {"headers":{"Authorization": "Bearer "+accessToken, "Content-Type": "application/json"}});
    console.log("----- alexaSessionConnected ----- url:", iotServiceUrl, " response:", response.data);
    if(response.data.result !=0) {
        console.error('response result!=0 msg:', response.data.msg);
        return null;
    };
}

async function sendSessionDisconnected(event){
    console.log("----- index.sendSessionDisconnected -----");

    let accessToken = event.directive.endpoint.scope.token;
    let envStr = getEnvStr(event.directive.endpoint.scope.token);
    
    let iotServiceUrl = env.iotServiceUrlMap[envStr];
    if(!iotServiceUrl) {
        console.error('Can not find iotServiceUrl with env:', envStr);
        return null;
    };

    // send report live alexaSessionDisconnected 
    let response = await axios.post(iotServiceUrl+"/report/live/alexaSessionDisconnected", {"liveId": "alexa_"+event.directive.payload.sessionId, "serialNumber": event.directive.endpoint.endpointId}, {"headers":{"Authorization": "Bearer "+accessToken, "Content-Type": "application/json"}});
    console.log("----- alexaSessionDisconnected ----- url:", iotServiceUrl, " response:", response.data);
    if(response.data.result !=0) {
        console.error('response result!=0 msg:', response.data.msg);
        return null;
    };
}

async function getDeviceState(event){
    console.log("----- index.getDeviceState -----");

    let endpointId = event.directive.endpoint.endpointId;
    console.log("----- getDeviceState input endpointId ----- ", endpointId);

    let accessToken = event.directive.endpoint.scope.token;
    let envStr = getEnvStr(event.directive.endpoint.scope.token);

    let iotServiceUrl = env.iotServiceUrlMap[envStr];
    if(!iotServiceUrl) {
        console.error('Can not find iotServiceUrl with env:', envStr);
        return null;
    };

    // get device state
    let deviceStateResponse = await axios.post(iotServiceUrl+"/device/selectsingledevice", {"serialNumber": event.directive.endpoint.endpointId}, {"headers":{"Authorization": "Bearer "+accessToken, "Content-Type": "application/json"}});
    console.log("----- selectsingledevice ----- url:", iotServiceUrl, " response:", deviceStateResponse.data);
    if(deviceStateResponse.data.result !=0) {
        console.error('deviceStateResponse result!=0 msg:', deviceStateResponse.data.msg);
        return null;
    };

    let online = deviceStateResponse.data.data.online;
    let deviceStatus = deviceStateResponse.data.data.deviceStatus;

    return {
        "deviceState": online == '0'? "UNREACHABLE" : deviceStatus == '3' ? "UNREACHABLE" : "OK",
        "batteryLevel": deviceStateResponse.data.data.batteryLevel || 100
    };
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
