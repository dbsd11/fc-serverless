const axios = require('axios');

async function handleAPL(eventBody, iotServiceUrl, accessToken) {
    let response = null;
    
    let intentType = eventBody.request.type;
    switch (intentType) {
        case 'IntentRequest':
            response = {
                outputSpeech: {
                    type: "PlainText",
                    text: "Welcome to use direction helper, have fun"
                },
                "shouldEndSession": false,
                "directives": [{
					"type": "Alexa.Presentation.APL.RenderDocument",
					"token": "123",
					"document": {
                      "type": "APL",
                      "version": "1.8",
                      "description": "This APL document places text on the screen and includes a button that sends the skill a message when selected. The button is a pre-defined responsive component from the alexa-layouts package.",
                      "import": [
                        {
                          "name": "alexa-layouts",
                          "version": "1.4.0"
                        }
                      ],
                    //   "theme": "light", //dark or light
                      "mainTemplate": {
                        "parameters": [
                          "payload"
                        ],
                        "items": [
                          {
                            "type": "Container",
                            "backgroundColor": "#363e3e",
                            "opacity": "0.25",
                            "height": "100vh",
                            "width": "100vw",
                            "direction": "column",
                            "justifyContent": "space-around",
                            "items": [
                              {
                                "type": "Text",
                                "id": "helloTextComponent",
                                "height": "30%",
                                "text": "Welcome to use direction helper. Touch the button to rotate camera.",
                                "textAlign": "center",
                                "textAlignVertical": "center",
                                "paddingLeft": "@spacingSmall",
                                "paddingRight": "@spacingSmall",
                                "paddingTop": "@spacingXLarge",
                                "style": "textStyleBody"
                              },
                              {
                                "type": "Container",
                                "direction": "row",
                                "justifyContent": "space-around",
                                "alignItems": "center",
                                "items": [
                                  {
                                    "type": "AlexaButton",
                                    "width": "30%",
                                    "id": "fadeHelloTextButtonTop",
                                    "buttonText": "UP",
                                    "primaryAction": [
                                      {
                                        "type": "SendEvent",
                                        "arguments": [
                                          "up"
                                        ]
                                      }
                                    ]
                                  }
                                ]
                              },
                              {
                                "type": "Container",
                                "direction": "row",
                                "justifyContent": "space-around",
                                "alignItems": "center",
                                "items": [
                                  {
                                    "type": "AlexaButton",
                                    "width": "30%",
                                    "id": "fadeHelloTextButtonLeft",
                                    "buttonText": "LEFT",
                                    "primaryAction": [
                                      {
                                        "type": "SendEvent",
                                        "arguments": [
                                          "left"
                                        ]
                                      }
                                    ]
                                  },
                                  {
                                    "type": "AlexaButton",
                                    "width": "30%",
                                    "id": "fadeHelloTextButtonRight",
                                    "buttonText": "RIGHT",
                                    "primaryAction": [
                                      {
                                        "type": "SendEvent",
                                        "arguments": [
                                          "right"
                                        ]
                                      }
                                    ]
                                  }
                                ]
                              },
                              {
                                "type": "Container",
                                "direction": "row",
                                "justifyContent": "space-around",
                                "alignItems": "center",
                                "items": [
                                  {
                                    "type": "AlexaButton",
                                    "width": "30%",
                                    "alignSelf": "end",
                                    "id": "fadeHelloTextButtonBottom",
                                    "buttonText": "DOWN",
                                    "primaryAction": [
                                      {
                                        "type": "SendEvent",
                                        "arguments": [
                                          "down"
                                        ]
                                      }
                                    ]
                                  }
                                ]
                              }
                            ]
                          }
                        ]
                      }
                    }
				}]
            };
            break;
        case 'Alexa.Presentation.APL.UserEvent':
            let userEventArguments = eventBody.request["arguments"];
            
            let pitch = 0.0;
            let yaw = 0.0;
            if (userEventArguments.indexOf('up')!=-1) {
                pitch = 0.1;
            }
            if (userEventArguments.indexOf('down')!=-1) {
                pitch = -0.1;
            }
            if (userEventArguments.indexOf('left')!=-1) {
                yaw = -0.1;
            }
            if (userEventArguments.indexOf('right')!=-1) {
                yaw = 0.1;
            };
            
            // send device rotate 
            let deviceRotateResponse = await axios.post(iotServiceUrl+"/device/rotate", {"serialNumber": "282848d28d841952da6b4aa7087ea836", "pitch": pitch, "yaw": yaw}, {"headers":{"Authorization": "Bearer "+accessToken, "Content-Type": "application/json"}});
            console.log("----- device rotate ----- url:", iotServiceUrl, " response:", deviceRotateResponse.data);
            if(deviceRotateResponse.data.result !=0) {
                console.error('response result!=0 msg:', deviceRotateResponse.data.msg);
                return null;
            };
            
            response = {
                outputSpeech: {
                    type: "PlainText",
                    text: JSON.stringify(userEventArguments)
                }
            }
            break;
        default:
            break;
    };
    
    let aplResponse = {
        version: "1.0",
        sessionAttributes: {},
        response: response
    };
    return aplResponse;
}

module.exports = {
    handleAPL: handleAPL
}