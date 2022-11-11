// -*- coding: utf-8 -*-

'use strict';
const axios = require('axios');
const AlexaResponse = require("./AlexaResponse");

exports.handler = async (event) => {
    // Dump the request for logging - check the CloudWatch logs
    console.log("----- index.handler request  -----");
    console.log(JSON.stringify(event));
    
    var eventParams = event.rawQueryString;
    
    var eventBody = JSON.parse(event.body);
    
    var tenantId = eventBody["tenantId"];
    var userId = eventBody["userId"];
    var alexaSessionId = eventBody["alexaSessionId"];
    var alexaOffer = eventBody["alexaOffer"];
    var serialNumber = eventBody["serialNumber"];
    
    var domainName = event.requestContext.domainName
    if(domainName.indexOf('lambda-') == -1) {
        return sendResponse({
            "code": -102,
            "msg": "must request with lambda-api domain",
            "data": {}
        });
    }
    
    var paasBaseUrl = "https://"+domainName.replace("lambda-","");
    
    if (!tenantId || !userId) {
        return sendResponse({
            "code": -102,
            "msg": "no tenantId or userId",
            "data": {}
        });
    }
    
    if (!alexaSessionId || !alexaOffer) {
        return sendResponse({
            "code": -102,
            "msg": "no alexaSessionId or alexaOffer",
            "data": {}
        });
    }
    
    if (!serialNumber) {
        return sendResponse({
            "code": -102,
            "msg": "no serialNumber",
            "data": {}
        });
    }
    
    if (!paasBaseUrl) {
        return sendResponse({
            "code": -102,
            "msg": "no paasBaseUrl",
            "data": {}
        });
    }

    // get webrtc ticket
    let viewerTicketResponse = await axios.post(paasBaseUrl+"/open-api/alexa/webrtcanswer?"+eventParams, {"tenantId": tenantId, "userId": userId, "alexaSessionId": alexaSessionId, "serialNumber": serialNumber}, {"headers":{"Content-Type": "application/json"}});
    console.log("----- webrtcanswer ----- ", " response:", viewerTicketResponse.data);
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
        "sdpOffer": alexaOffer,
        "viewerTicket": viewerTicket,
        "sessionId": alexaSessionId,
        "devicePlatform": "alexa"
    };

    console.info('request alexaSdpAnswer url:','https://'+(signalServerHost?signalServerHost:signalServerIpAddress)+"/api/getAlexaSdpAnswer")
    let alexaSdpAnswerResponse = await axios.post('https://'+(signalServerHost?signalServerHost:signalServerIpAddress)+"/api/getAlexaSdpAnswer", alexaSdpOfferRequestBody, {"headers":{"Content-Type": "application/json"}}).catch((error) =>{
        console.log("error: " + error);
      });
    console.info('alexaSdpAnswerResponse:', alexaSdpAnswerResponse)
    if(alexaSdpAnswerResponse.data.result !=0){
        console.error('alexaSdpAnswerResponse result!=0 msg:', alexaSdpAnswerResponse.data.msg);
        return null;
    };

    try {
        // send report live alexaSdpReturnAnswer 
        let response = await axios.post(paasBaseUrl+"/report/live/alexaSdpReturnAnswer", {"liveId": "alexa_"+alexaSessionId, "serialNumber": serialNumber}, {"headers":{"Content-Type": "application/json"}});
    } catch(e) {};
    
    let sdpAnswer = alexaSdpAnswerResponse.data.data.sdp;
    return sendResponse({
        "alexaAnswer": sdpAnswer
    });
};

async function getSDPAnswer(iotServiceUrl, iotServiceToken, event) {
    console.log("----- index.getSDPAnswer -----");
    
    // Alexa SDP Offer
    const sdpOffer = JSON.stringify({"type": "offer","sdp": event.directive.payload.offer.value});
    console.log("----- getSDPAnswer input offer ----- ", sdpOffer);

    // get webrtc ticket
    let viewerTicketResponse = await axios.post(iotServiceUrl+"/device/notAppGetWebrtcTicket", {"serialNumber": event.directive.endpoint.endpointId, "alexaConfig": JSON.stringify({"sessionId": event.directive.payload.sessionId}), "config": JSON.stringify({"sessionId": event.directive.payload.sessionId, "devicePlatform": "alexa"})}, {"headers":{"Authorization": "Bearer "+iotServiceToken, "Content-Type": "application/json"}});
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
    let alexaSdpAnswerResponse = await axios.post('https://'+(signalServerHost?signalServerHost:signalServerIpAddress)+"/api/getAlexaSdpAnswer", alexaSdpOfferRequestBody, {"headers":{"Authorization": "Bearer "+iotServiceToken, "Content-Type": "application/json"}}).catch((error) =>{
        console.log("error: " + error);
      });
    console.info('alexaSdpAnswerResponse:', alexaSdpAnswerResponse)
    if(alexaSdpAnswerResponse.data.result !=0){
        console.error('alexaSdpAnswerResponse result!=0 msg:', alexaSdpAnswerResponse.data.msg);
        return null;
    };

    try {
        // send report live alexaSdpReturnAnswer 
        let response = await axios.post(iotServiceUrl+"/report/live/alexaSdpReturnAnswer", {"liveId": "alexa_"+event.directive.payload.sessionId, "serialNumber": event.directive.endpoint.endpointId}, {"headers":{"Authorization": "Bearer "+iotServiceToken, "Content-Type": "application/json"}});
        console.log("----- alexaSdpReturnAnswer ----- url:", iotServiceUrl, " response:", response.data);
    } catch(e) {};
    
    let sdpAnswer = alexaSdpAnswerResponse.data.data.sdp;
    return sdpAnswer;
}

function sendResponse(response) {
    console.log("----- index.sendResponse -----");
    console.log(JSON.stringify(response));
    return response
}