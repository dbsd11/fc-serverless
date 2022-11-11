// -*- coding: utf-8 -*-

// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.

// Licensed under the Amazon Software License (the "License"). You may not use this file except in
// compliance with the License. A copy of the License is located at

//    http://aws.amazon.com/asl/

// or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific
// language governing permissions and limitations under the License.

const { v4 } = require("uuid");
const uuid = v4;

'use strict';

/**
 * Helper class to generate an AlexaResponse.
 * @class
 */
class AlexaResponse {

    /**
     * Generate an endpointId for an Alexa Appliance based on uuid generation.
     * @param {*} prefix  a prefix to add to the generated identifier
     * @returns {*} An uuid with the given prefix if any
     */
    static generateEndpointId(prefix){
        let endpointId = uuid();
        if (prefix === undefined || prefix === {} || prefix === ""){
            return endpointId;
        }
        return prefix + "-" + endpointId;
    }

    /**
     * Check a value for validity or return a default.
     * @param value The value being checked
     * @param defaultValue A default value if the passed value is not valid
     * @returns {*} The passed value if valid otherwise the default value.
     */
    defaultIfEmpty(value, defaultValue) {

        if (value === undefined || value === {} || value === ""){
            return defaultValue;
        }

        return value;
    }

    /**
     * Constructor for an Alexa Response.
     * @constructor
     * @param opts Contains initialization options for the response
     */
    constructor(opts) {

        if (opts === undefined)
            opts = {};

        if (opts.context !== undefined)
            this.context = this.defaultIfEmpty(opts.context, undefined);

        if (opts.event !== undefined)
            this.event = this.defaultIfEmpty(opts.event, undefined);
        else
            this.event = {
            "header": {
                "namespace": this.defaultIfEmpty(opts.namespace, "Alexa"),
                "name": this.defaultIfEmpty(opts.name, "Response"),
                "messageId": this.defaultIfEmpty(opts.messageId, uuid()),
                "correlationToken": this.defaultIfEmpty(opts.correlationToken, undefined),
                "payloadVersion": this.defaultIfEmpty(opts.payloadVersion, "3")
            },
            "endpoint": {
                "scope": {
                    "type": "BearerToken",
                    "token": this.defaultIfEmpty(opts.token, "INVALID"),
                },
                "endpointId": this.defaultIfEmpty(opts.endpointId, "INVALID")
            },
            "payload": this.defaultIfEmpty(opts.payload, {})
        };

        // No endpoint in an AcceptGrant or Discover request
        if (this.event.header.name === "AcceptGrant.Response" || this.event.header.name === "Discover.Response")
            delete this.event.endpoint;

    }

    /**
     * Add a property to the context.
     * @param opts Contains options for the property.
     */
    addContextProperty(opts) {

        if (this.context === undefined)
            this.context = {properties: []};

        this.context.properties.push(this.createContextProperty(opts));
    }

    /**
     * Add an endpoint to the payload.
     * @param opts Contains options for the endpoint.
     */
    addPayloadEndpoint(opts) {

        if (this.event.payload.endpoints === undefined)
            this.event.payload.endpoints = [];

        this.event.payload.endpoints.push(this.createPayloadEndpoint(opts));
    }

    /**
     * Creates a property for the context.
     * @param opts Contains options for the property.
     */
    createContextProperty(opts) {
        return {
            'namespace': this.defaultIfEmpty(opts.namespace, "Alexa.EndpointHealth"),
            'name': this.defaultIfEmpty(opts.name, "connectivity"),
            'value': this.defaultIfEmpty(opts.value, {"value": "OK"}),
            'timeOfSample': new Date().toISOString(),
            'uncertaintyInMilliseconds': this.defaultIfEmpty(opts.uncertaintyInMilliseconds, 0)
        };
    }

    /**
     * Creates an endpoint for the payload.
     * @param opts Contains options for the endpoint.
     */
    createPayloadEndpoint(opts) {

        if (opts === undefined) opts = {};

        // Return the proper structure expected for the endpoint
        let endpoint =
            {
                "capabilities": this.defaultIfEmpty(opts.capabilities, []),
                "description": this.defaultIfEmpty(opts.description, "Sample Endpoint Description"),
                "displayCategories": this.defaultIfEmpty(opts.displayCategories, ["OTHER"]),
                "endpointId": this.defaultIfEmpty(opts.endpointId, 'endpoint-001'),
                // "endpointId": this.defaultIfEmpty(opts.endpointId, 'endpoint_' + (Math.floor(Math.random() * 90000) + 10000)),
                "friendlyName": this.defaultIfEmpty(opts.friendlyName, "Sample Endpoint"),
                "manufacturerName": this.defaultIfEmpty(opts.manufacturerName, "NACHOS")
            };

        if (opts.hasOwnProperty("cookie")) {
            endpoint["cookie"] = this.defaultIfEmpty('cookie', {});
        };
        
        if (opts.hasOwnProperty("additionalAttributes")) {
            endpoint["additionalAttributes"] = this.defaultIfEmpty(opts.additionalAttributes, {});
        }

        return endpoint
    }

    /**
     * Creates a capability for an endpoint within the payload.
     * @param opts Contains options for the endpoint capability.
     */
    createPayloadEndpointCapability(opts) {

        if (opts === undefined) opts = {};

        let capability = {};
        capability['type'] = this.defaultIfEmpty(opts.type, "AlexaInterface");
        capability['interface'] = this.defaultIfEmpty(opts.interface, "Alexa");
        capability['version'] = this.defaultIfEmpty(opts.version, "3");
        let supported = this.defaultIfEmpty(opts.supported, false);
        if (supported) {
            capability['properties'] = {};
            capability['properties']['supported'] = supported;
            capability['properties']['proactivelyReported'] = this.defaultIfEmpty(opts.proactivelyReported, false);
            capability['properties']['retrievable'] = this.defaultIfEmpty(opts.retrievable, false);
        }
        let configuration = this.defaultIfEmpty(opts.configuration, false);
        if (configuration){
            capability['configuration'] = configuration;
        }

        // add interface self capability
        let proR = this.defaultIfEmpty(opts.interface, "Alexa");
        if (proR.toLowerCase().includes('doorbell')){
            capability['proactivelyReported'] = this.defaultIfEmpty(opts.proactivelyReported, false);
        }
        return capability
    }

    /**
     * Get the composed Alexa Response.
     * @returns {AlexaResponse}
     */
    get() {
        return this;
    }
}

module.exports = AlexaResponse;