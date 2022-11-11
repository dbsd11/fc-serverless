# -*- coding: utf-8 -*-

import ssl
ssl._create_default_https_context = ssl._create_unverified_context

import urllib
import urllib.request
from urllib import parse
import requests

import json
import base64
import re

oauthUrlMap = {
    "bisong": "http://localhost:10101"
}

def fetchResponse(apiUrl, request_method, headers, body=None):
    print(apiUrl)
    print(request_method)
    print(headers)
    print(body)
    if headers == None:
        headers = {}

    request = urllib.request.Request(apiUrl,headers=headers,data=str(body).encode('utf-8'),method=request_method)
    response = None
    try:
        responseBody = urllib.request.urlopen(request).read().decode('utf-8', 'ignore')
        response = [200, responseBody]
    except Exception as e:
        response = [int(e.code), e.reason]
    return response

def fetchRedirectLocation(apiUrl, request_method, headers):
    print(apiUrl)
    print(request_method)
    print(headers)
    if headers == None:
        headers = {}
    
    request = urllib.request.Request(apiUrl,headers=headers,method=request_method)
    response = None
    try:
        responseObj = requests.get(apiUrl, headers=headers, allow_redirects=False)
        response = [responseObj.status_code, responseObj.headers["Location"]]
    except Exception as e:
        print(e)
        response = [int(e.code), e.reason]
    return response

def base64Padding(data):
    missing_padding = 4 - len(data) % 4
    if missing_padding:
        data += b'=' * missing_padding
    return data

def getEnvStrByAccessToken(oauthAccessTokenBase64):
    envStr = None
    try:
        oauthAccessToken = base64.urlsafe_b64decode(base64Padding(oauthAccessTokenBase64.split('.')[1].encode('utf-8'))).decode('utf-8', 'ignore')
        iotSericeTokenWithEnvBase64 = list(filter(lambda str:len(str)>10, re.findall(r'\"jti\":\"[0-9a-zA-Z=+/]*\"', oauthAccessToken)[0].split('"')))[0]
        iotSericeTokenWithEnv = base64.urlsafe_b64decode(iotSericeTokenWithEnvBase64.encode('utf-8')).decode('utf-8', 'ignore')
        envStr = iotSericeTokenWithEnv[:iotSericeTokenWithEnv.find('_')]
    except Exception as e:
        print(e)
        pass
    return envStr

def getEnvStrByAuthCode(authCodeBase64):
    envStr = None
    try:
        authCode = base64.urlsafe_b64decode(base64Padding(authCodeBase64.encode('utf-8'))).decode('utf-8', 'ignore')
        envStr = authCode[:authCode.find('_')]
    except Exception as e:
        print(e)
        pass
    return envStr

def lambda_handler(event, context):
    print('event:'+str(event))

    queryStringParameters = event['queryStringParameters']
    
    apiPath = queryStringParameters.pop('p')
    if apiPath[0]!='/':
        apiPath = '/'+apiPath
    
    if apiPath.find('/oauth/authorize')>=0:
        return oauth_authorize(event)
    
    if apiPath.find('oauth/token')<0:
        print('only support /oauth/token')
        return {
            'statusCode': 400,
            'body': json.dumps('only support /oauth/token')
        }

    if 'Authorization' in event['headers']:
        event['headers']['authorization'] = event['headers']['Authorization']
    if 'Content-Type' in event['headers']:
        event['headers']['content-type'] = event['headers']['Content-Type'] 
    print('headers:'+str(event['headers']))
    
    authorizationToken = event['headers']['authorization']
    
    if authorizationToken == None:
        print('no authorizationToken')
        return {
            'statusCode': 400,
            'body': json.dumps('no authorizationToken')
        }
        
    grantType = None
    if 'grant_type' in queryStringParameters:
        grantType = queryStringParameters['grant_type']
    elif 'body' in event:
        if event['headers']["content-type"].find('json')>=0:
                grantType = json.loads(event['body'])['grant_type']
        elif event['headers']["content-type"].find('urlencoded')>=0:
            bodyBase64 = event['body']
            body = base64.urlsafe_b64decode(bodyBase64.encode('utf-8')).decode('utf-8', 'ignore')
            grantType = parse.parse_qs(body)['grant_type'][0]
    
    if grantType == None:
        print('no grant_type')
        return {
            'statusCode': 400,
            'body': json.dumps('no grant_type')
        }
    
    authCodeBase64 = None
    refreshTokenBase64 = None
    envStr = None
    if grantType.lower() == 'authorization_code':
        if 'code' in queryStringParameters:
            authCodeBase64 = queryStringParameters['code']
        elif 'body' in event:
            if event['headers']["content-type"].find('json')>=0:
                authCodeBase64 = json.loads(event['body'])['code']
            elif event['headers']["content-type"].find('urlencoded')>=0:
                bodyBase64 = event['body']
                body = base64.urlsafe_b64decode(bodyBase64.encode('utf-8')).decode('utf-8', 'ignore')
                authCodeBase64 = parse.parse_qs(body)['code'][0]
        envStr = getEnvStrByAuthCode(authCodeBase64)
    else:
        if 'refresh_token' in queryStringParameters:
            refreshTokenBase64 = queryStringParameters['refresh_token']
        elif 'body' in event:
            if event['headers']["content-type"].find('json')>=0:
                refreshTokenBase64 = json.loads(event['body'])['refresh_token']
            elif event['headers']["content-type"].find('urlencoded')>=0:
                bodyBase64 = event['body']
                body = base64.urlsafe_b64decode(bodyBase64.encode('utf-8')).decode('utf-8', 'ignore')
                refreshTokenBase64 = parse.parse_qs(body)['refresh_token'][0]
        envStr = getEnvStrByAccessToken(refreshTokenBase64)
        
    if envStr == None:
        print('illegal authorizationToken')
        if refreshTokenBase64 != None:
            return  {
                'statusCode': 400,
                'body': json.dumps({
                    "error": "invalid_grant",
                    "error_description": "Invalid refresh token: " + refreshTokenBase64
                })
            }
        else:
            return  {
                'statusCode': 400,
                'body': json.dumps('invalid grant_type')
            }
    
    apiUrl = oauthUrlMap[envStr]
    apiUrl = apiUrl + apiPath + "?" + parse.urlencode(queryStringParameters)
    
    if 'httpMethod' in event:
        method = event['httpMethod']
    else:
        method = event['requestContext']['http']['method']
    
    headers = {
        "Authorization": event['headers']["authorization"]
    }
    
    if 'content-type' in event['headers']:
        headers["Content-Type"] = event['headers']["content-type"]
    
    body = None
    if 'body' in event and event['headers']["content-type"].find('json')>=0:
        body = event['body']
    elif 'body' in event and event['headers']["content-type"].find('urlencoded')>=0:
        bodyBase64 = event['body']
        body = base64.urlsafe_b64decode(bodyBase64.encode('utf-8')).decode('utf-8', 'ignore')
        if authCodeBase64 != None:
            authCodeBase64New = base64Padding(authCodeBase64.encode('utf-8')).decode('utf-8', 'ignore')
            body = body.replace(authCodeBase64, authCodeBase64New);
        
    response = fetchResponse(apiUrl, method, headers, body)
    print(response)
    return {
        'statusCode': response[0],
        'body': response[1]
    }

def oauth_authorize(event):
    if 'httpMethod' in event:
        method = event['httpMethod']
    else:
        method = event['requestContext']['http']['method']
    
    if 'Authorization' in event['headers']:
        event['headers']['authorization'] = event['headers']['Authorization']
    if 'Content-Type' in event['headers']:
        event['headers']['content-type'] = event['headers']['Content-Type'] 
        
    if 'origin' not in event['headers']:
        event['headers']['origin'] = '*' 
    if event['headers']['origin'] != '*':
        event['headers']['Access-Control-Allow-Credentials'] = "true"
    else:
        event['headers']['Access-Control-Allow-Credentials'] = "false"

    print('headers:'+str(event['headers']))
        
    if method == 'OPTIONS':
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": event['headers']['origin'],
                "Access-Control-Allow-Credentials": event['headers']['Access-Control-Allow-Credentials'],
                "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
                "Access-Control-Max-Age": "3600",
                "Access-Control-Allow-Headers": "Authorization, Origin, X-Requested-With, Content-Type, Accept, *"
            },
            "body": "HI"
        }
    
    queryStringParameters = event['queryStringParameters']
    proxy_url = queryStringParameters.pop("proxy_url")
    apiUrl = proxy_url + "?" + parse.urlencode(queryStringParameters)
    
    headers = {
        "Authorization": event['headers']["authorization"]
    }
    
    if 'content-type' in event['headers']:
        headers["Content-Type"] = event['headers']["content-type"]
    
    response = fetchRedirectLocation(apiUrl, method, headers)
    print(response)
    return {
        'statusCode': 200,
        "headers": {
            "Access-Control-Allow-Origin": event['headers']['origin'],
            "Access-Control-Allow-Credentials": event['headers']['Access-Control-Allow-Credentials'],
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
            "Access-Control-Max-Age": "3600",
            "Access-Control-Allow-Headers": "Authorization, Origin, X-Requested-With, Content-Type, Accept, *"
        },
        'body': response[1]
    }