'use strict'

var localVideo = document.querySelector('video#localvideo');
var remoteVideo = document.querySelector('video#remotevideo');

var btnConn = document.querySelector('button#connserver');
var btnLeave = document.querySelector('button#leave');

var offer = document.querySelector('textarea#offer');
var answer = document.querySelector('textarea#answer');

var optBW = document.querySelector('select#bandwidth');

var shareDeskBox  = document.querySelector('input#shareDesk');

var pcConfig = {
  'iceServers': [{
    'urls': 'turn:stun.al.learningrtc.cn:3478',
    'credential': "mypasswd",
    'username': "garrylea"
  }]
};

var localStream = null;
var remoteStream = null;

var roomid = '123123';
var socket = null;

var offerdesc = null;
var state = 'init';

var pc = null;

// 以下代码是从网上找的
//=========================================================================================

//如果返回的是false说明当前操作系统是手机端，如果返回的是true则说明当前的操作系统是电脑端
function IsPC() {
	var userAgentInfo = navigator.userAgent;
	var Agents = ["Android", "iPhone","SymbianOS", "Windows Phone","iPad", "iPod"];
	var flag = true;

	for (var v = 0; v < Agents.length; v++) {
		if (userAgentInfo.indexOf(Agents[v]) > 0) {
			flag = false;
			break;
		}
	}

	return flag;
}

//如果返回true 则说明是Android  false是ios
function is_android() {
	var u = navigator.userAgent, app = navigator.appVersion;
	var isAndroid = u.indexOf('Android') > -1 || u.indexOf('Linux') > -1; //g
	var isIOS = !!u.match(/\(i[^;]+;( U;)? CPU.+Mac OS X/); //ios终端
	if (isAndroid) {
		//这个是安卓操作系统
		return true;
	}

	if (isIOS) {
      　　//这个是ios操作系统
     　　 return false;
	}
}

//获取url参数
function getQueryVariable(variable)
{
       var query = window.location.search.substring(1);
       var vars = query.split("&");
       for (var i=0;i<vars.length;i++) {
               var pair = vars[i].split("=");
               if(pair[0] == variable){return pair[1];}
       }
       return(false);
}
//=======================================================================

function sendMessage(roomid, data)
{
    console.log('Send p2p message: roomid=' + roomid + ' data=' + data);

    if(!socket) {
        console.log('SendMessage is error: socket is null');
    }
    socket.emit('message', roomid, data);
}

function getOffer(desc)
{
    pc.setLocalDescription(desc);

    offer.value = desc.sdp;
    offerdesc = desc;

    sendMessage(roomid, offerdesc);
}

function handleOfferError(err) 
{
    console.error('Failed to get Offer!', err);
}

function getAnswer(desc)
{
    pc.setLocalDescription(desc);

    optBW.disabled = false;
    answer.value = desc.sdp;

    sendMessage(roomid, desc);
}

function handleAnswerError(err)
{
    console.error('Failed to get Answer!', err);
}

function call()
{
    console.log('call ...');
    if(state === 'joined_conn') {
        if(pc) {
            var options = {
                offerToRecieveVideo: 1,
                offerToRecieveAudio: 1
            }

            pc.createOffer(options)
                    .then(getOffer).catch(handleOfferError);
        }
    }
}

function connSignalServer()
{
    // 开启本地视频
    start();

    return true;
}

function conn()
{
    socket = io.connect();

    socket.on('joined', (roomid, id)=> {  // id -> 用户id
        btnConn.disabled = true;
        btnLeave.disabled = false;

        state = 'joined';
        
        createPeerConnection();
        bindTracks();

        console.log('Receive joined message: roomid=' + roomid + ' userid=' + id + ' state=' + state);
    });

    socket.on('otherjoin', (roomid, id)=> {
        if(state === 'joined_unbind') {
            createPeerConnection();
            bindTracks();
        }

        state = 'joined_conn';

        // 媒体协商
        call();
        
        console.log('Receive otherjoin message: roomid=' + roomid + ' userid=' + id + ' state=' + state);
    });

    socket.on('full', (roomid, id)=> {
        state = 'leaved';

        hangup();
        //socket.disconnect();
        closeLocalMedia();

        btnConn.disabled = false;
        btnLeave.disabled = true;

        console.log('Receive full message: roomid=' + roomid + ' userid=' + id + ' state=' + state);
        
        alert('The room is full!');
    });
    
    socket.on('leaved', (roomid, id)=> {
        state = 'leaved';

        socket.disconnect();

        btnConn.disabled = false;
        btnLeave.disabled = true;

        console.log('Receive leaved message: roomid=' + roomid + ' userid=' + id + ' state=' + state);
    });
    
    socket.on('bye', (roomid, id)=> {
        //state = 'created';
		//当是多人通话时，应该带上当前房间的用户数
		//如果当前房间用户不小于 2, 则不用修改状态
		//并且，关闭的应该是对应用户的peerconnection
		//在客户端应该维护一张peerconnection表，它是
		//一个key:value的格式，key=userid, value=peerconnection

        state = 'joined_unbind';
        
        hangup();
		offer.value = '';
		answer.value = '';
        //closePeerConnection();

        console.log('Receive bye message: roomid=' + roomid + ' userid=' + id + ' state=' + state);
    });
    
    socket.on('disconnect', (socket) => {
		if(!(state === 'leaved')){
			hangup();
			closeLocalMedia();
		}
		state = 'leaved';

		console.log('Receive disconnect message! roomid=' + roomid);
	});

    socket.on('message', (roomid, data)=> {
        // 媒体协商
        if(data === null || data === undefined){
			console.error('The message is invalid!');
			return;	
		}

		if(data.hasOwnProperty('type') && data.type === 'offer') {
            offer.value = data.sdp;

            pc.setRemoteDescription(new RTCSessionDescription(data));

            pc.createAnswer()
                    .then(getAnswer).catch(handleAnswerError);
		} else if(data.hasOwnProperty('type') && data.type == 'answer'){
            optBW.disabled = false;
            answer.value = data.sdp;

            pc.setRemoteDescription(new RTCSessionDescription(data));
		} else if (data.hasOwnProperty('type') && data.type === 'candidate'){
            var candidate = new RTCIceCandidate({
                sdpMLineIndex: data.label,
                candidate: data.candidate
            });

            pc.addIceCandidate(candidate);
        } else {
            console.error('The message is invalid!', data);
        }

        console.log('Receive client message: roomid=' + roomid + ' data=' + data);
    });

    //roomid = getQueryVariable('room');
    socket.emit('join', roomid);

    return;
}

function getMediaStream(stream)
{
    if(localStream){
		stream.getAudioTracks().forEach((track)=>{
			localStream.addTrack(track);	
			stream.removeTrack(track);
		});
	}else{
		localStream = stream;	
	}

	localVideo.srcObject = localStream;

	//这个函数的位置特别重要，
	//一定要放到getMediaStream之后再调用
	//否则就会出现绑定失败的情况
	//
	//setup connection
	conn();
}

function handleError(err)
{
    console.error('Failed to get Media Stream: ', err.name);
}

function getDeskStream(stream){
	localStream = stream;
}

function handleShareDeskError(err){
	console.error('Failed to get Media Stream!', err);
}

function shareDesk(){
	if(IsPC()){
		navigator.mediaDevices.getDisplayMedia({video: true})
			.then(getDeskStream).catch(handleShareDeskError);
		return true;
	}
	return false;
}

function start()
{
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('The getUserMedia is not supported!');
        return;
    } else {
        var constraints;

		if(shareDeskBox.checked && shareDesk()) {
			constraints = {
				video: false,
				audio:  {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				}
			}
		} else {
			constraints = {
				video: true,
				audio:  {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				}
			}
		}

        navigator.mediaDevices.getUserMedia(constraints)
                .then(getMediaStream).catch(handleError);
    }
}


function closeLocalMedia()
{
    if(localStream && localStream.getTracks()) {
        localStream.getTracks().forEach((track)=>{
            track.stop();
        });
    }
    localStream = null;
}

function leave()
{
    if(socket) {
        socket.emit('leave', '123123');
    }
    
    hangup();
	closeLocalMedia();

	offer.value = '';
	answer.value = '';

    //closePeerConnection();
    //closeLocalMedia();

    btnConn.disabled = false;
    btnLeave.disabled = true;
}

function getRemoteStream(e){
	remoteStream = e.streams[0];
	remoteVideo.srcObject = e.streams[0];
}

function createPeerConnection()
{
    //如果是多人的话，在这里要创建一个新的连接.
	//新创建好的要放到一个map表中。
	//key=userid, value=peerconnection
    console.log('Create RTCPeerConnection ...');
    if(!pc) {
        pc = new RTCPeerConnection(pcConfig);

        pc.onicecandidate = (e)=> {
            if(e.candidate) {
                console.log('Find an new candidate:', e.candidate);

                sendMessage(roomid, {
                    type: 'candidate',
                    label: event.candidate.sdpMLineIndex,
                    id: event.candidate.sdpMid,
                    candidate: event.candidate.candidate
                });
            } else {
                console.log('This is the end candidate');
            }
        }

        pc.ontrack = getRemoteStream;
    } else {
        console.log('The pc have be created!');
    }

    //if(localStream) {
    //    localStream.getTracks().forEach((track)=>{
    //        pc.addTrack(track);
    //    });
    //}
    return;
}

//绑定永远与 peerconnection在一起，
//所以没必要再单独做成一个函数
function bindTracks()
{
	console.log('Bind tracks into RTCPeerConnection!');

	if( pc === null || pc === undefined) {
		console.error('pc is null or undefined!');
		return;
	}

	if(localStream === null || localStream === undefined) {
		console.error('localstream is null or undefined!');
		return;
	}

	//add all track into peer connection
	localStream.getTracks().forEach((track)=>{
		pc.addTrack(track, localStream);	
	});
}

function hangup()
{
    console.log('Close RTCPeerConnection ...');
	if(pc) {
		offerdesc = null;
		pc.close();
		pc = null;
	}
}

function closePeerConnection()
{
    console.log('Close RTCPeerConnection ...');
    if(pc) {
        pc.close();
        pc = null;
    }
}

function change_bw()
{
    bandwidth.disabled = true;
    var bw = optBW.options[optBW.selectedIndex].value;

    var vsender = null;
    var senders = pc.getSenders(); // 获取所有的发送器

    senders.forEach( sender => {
        if(sender && sender.track.kind === 'video') {
            vsender = sender;
        } 
    });

    var parameters = vsender.getParameters();
    if(!parameters.encodings) {
        return;
    }

    if(bw === 'unlimited') {
        return;
    } 
 
    parameters.encodings[0].maxBitrate = bw * 1000;

    vsender.setParameters(parameters)
        .then(()=>{
            bandwidth.disabled = false;
            console.log('Successed to set parameters!');
        })
        .catch(err =>{
            console.error(err);
        });

    return;
}

btnConn.onclick = connSignalServer;
btnLeave.onclick = leave;
optBW.onchange = change_bw;


