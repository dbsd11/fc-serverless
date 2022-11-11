# /usr/bin/python2.7
# -*- coding: utf-8 -*-
import sys
reload(sys)
sys.setdefaultencoding('utf8')

import ssl
ssl._create_default_https_context = ssl._create_unverified_context

import urllib2

import json

def fetchApiData(apiUrl, request_method, headers, body=None):
    print(apiUrl)
    print(headers)
    print(body)
    if headers == None:
        headers = {}
    if body != None:
        headers["Content-Type"]="application/json;charset=UTF-8"

    request = urllib2.Request(apiUrl, data=body, headers=headers)
    request.get_method = lambda: request_method
    response = urllib2.urlopen(request, context=ssl._create_unverified_context())
    try:
        apiData = json.loads(response.read())
    except Exception as e:
        apiData = {}
    return apiData

def upload_file(uploadUrl, headers, body_bytes):
    print(uploadUrl)
    print(headers)
    request = urllib2.Request(uploadUrl, data=body_bytes, headers=headers)
    request.get_method = lambda: "POST"
    response = urllib2.urlopen(request, context=ssl._create_unverified_context())
    try:
        upload_response = json.loads(response.read())
    except Exception as e:
        upload_response = {}
    return upload_response

def handler(environ, start_response):
    zdApiUrl = 'https://addxai.zendesk.com{path_info}?{query_string}'.format(path_info=environ['PATH_INFO'], query_string=environ['QUERY_STRING'])
    content_type = environ.get('CONTENT_TYPE')
    request_body_size = int(environ.get('CONTENT_LENGTH',0))
    if "multipart/form-data" in content_type:
        request_body = environ['wsgi.input'].read(request_body_size)
        last_byte1 = None
        last_byte2 = None
        last_byte3 = None
        start_offset = 0
        for bt in request_body:
            if (last_byte3 == "\n") and (bt == "\n"):
                start_offset += 1
                break
            if (last_byte1 == "\r") and (last_byte2 == "\n") and (last_byte3 == "\r") and (bt == "\n"):
                start_offset += 1
                break
            last_byte1 = last_byte2
            last_byte2 = last_byte3
            last_byte3 = bt
            start_offset += 1
        
        data_length = int(environ['HTTP_DATA_LENGTH'])
        request_body = request_body[start_offset : start_offset + data_length]
        print("start_offset:"+str(start_offset))

        headers = {}
        headers["Content-Type"] = "application/binary"
        headers["Content-Length"] = data_length
        if "," in environ['HTTP_AUTHORIZATION']:
            headers["authorization"] = environ['HTTP_AUTHORIZATION'].split(",")[1].lstrip()
        else:
            headers["authorization"] = environ['HTTP_AUTHORIZATION'].lstrip()

        try:
            status = '200 OK'
            upload_response = upload_file(zdApiUrl, headers, request_body)
        except urllib2.HTTPError as e:
            print(e)
            status = '500 Internal Server Error'
            upload_response = {"error":"Internal Server Error","description":"Upload failed"}
        response_body = upload_response
    else:
        request_method = environ['REQUEST_METHOD']
        request_body = environ['wsgi.input'].read(request_body_size)

        headers = {}
        if "," in environ['HTTP_AUTHORIZATION']:
            headers["authorization"] = environ['HTTP_AUTHORIZATION'].split(",")[1].lstrip()
        else:
            headers["authorization"] = environ['HTTP_AUTHORIZATION'].lstrip() 
        
        try:
            status = '200 OK'
            apiData = fetchApiData(zdApiUrl, request_method, headers, request_body)
            print(apiData)
        except urllib2.HTTPError as e:
            print(e)
            status = '404 Not Found'
            apiData = {"error":"RecordNotFound","description":"Not found"}
        response_body = apiData

    # do something here
    response_headers = [('Content-type', 'text/json;charset=UTF-8')]
    start_response(status, response_headers)
    # Python2
    # return [json.dumps(response_body)]
    # Python3 tips: When using Python3, the str and bytes types cannot be mixed.
    # Use str.encode() to go from str to bytes
    return [json.dumps(response_body).encode()]