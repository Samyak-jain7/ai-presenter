import {test,expect,WebSocketRoute} from '@playwright/test';
test('six slides, interruption queue reset, resume, mute and two clean restarts',async({page})=>{
  await page.addInitScript(()=>{
    const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    (window as any).testTracks=[];
    navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await original(constraints);(window as any).testTracks.push(...stream.getTracks());return stream;};
  });
  let socket:WebSocketRoute,slide=1,epoch=0,mode='presentation',resume=1;
  const received:any[]=[];
  const emit=(message:object)=>socket.send(JSON.stringify(message));
  const sync=()=>emit({type:'state',slide,epoch,mode,resume});
  await page.routeWebSocket('**/session',ws=>{socket=ws;ws.onMessage(raw=>{
    const m=JSON.parse(raw as string);received.push(m);
    if(m.type==='start'){slide=m.slide;epoch=0;mode='presentation';resume=slide;emit({type:'ready'});sync();emit({type:'status',status:'thinking'});}
    if(m.type==='navigate'){slide=m.slide;resume=slide;epoch++;emit({type:'clear',epoch});sync();}
    if(m.type==='control'){slide=resume;mode='presentation';epoch++;emit({type:'clear',epoch});sync();}
    if(m.type==='end')ws.close();
  });});
  await page.goto('/');
  for(let i=1;i<=6;i++){await page.getByRole('button',{name:new RegExp(`0${i} `)}).click();await expect(page.locator('h1')).toHaveText(['A conversation, in motion','From sound to meaning','Context makes it a conversation','Give the answer a voice','Good agents know when to stop','One loop. Three boundaries.'][i-1]);}
  await page.getByRole('button',{name:/02 Speech recognition/}).click();
  for(let run=0;run<2;run++){
    await page.getByRole('button',{name:/Start presentation/}).click();await expect(page.getByTestId('status')).toContainText('thinking');
    for(let cycle=0;cycle<3;cycle++){
      emit({type:'audio',epoch,data:Buffer.alloc(48000).toString('base64')});await expect(page.getByTestId('status')).toContainText('speaking');
      const oldEpoch=epoch;epoch++;mode='question';resume=2;slide=5;emit({type:'clear',epoch});sync();emit({type:'status',status:'listening'});
      emit({type:'audio',epoch:oldEpoch,data:Buffer.alloc(48000).toString('base64')});
      await expect(page.locator('h1')).toHaveText('Good agents know when to stop');await expect(page.getByTestId('status')).toContainText('listening');
      await page.getByRole('button',{name:'Resume ↗',exact:true}).click();await expect(page.locator('h1')).toHaveText('From sound to meaning');
    }
    await page.getByRole('button',{name:'Mute microphone',exact:true}).click();await expect(page.getByRole('button',{name:'Unmute microphone'})).toHaveAttribute('aria-pressed','true');
    expect(await page.evaluate(()=>(window as any).testTracks.filter((t:MediaStreamTrack)=>t.readyState==='live').every((t:MediaStreamTrack)=>!t.enabled))).toBe(true);
    await expect.poll(()=>received.filter(m=>m.type==='mute').length).toBe(run+1);
    await page.getByRole('button',{name:'Unmute microphone'}).click();
    await page.getByRole('button',{name:'End session'}).click();await expect(page.getByTestId('status')).toHaveText('idle');
    expect(await page.evaluate(()=>(window as any).testTracks.every((t:MediaStreamTrack)=>t.readyState==='ended'))).toBe(true);
  }
  await page.screenshot({path:'dist/test-results/presenter.png',fullPage:true});
});
test('playback drains before auto-advance and stops at six',async({page})=>{
  let socket:WebSocketRoute,slide=1,epoch=0;const drains:number[]=[];
  const emit=(m:object)=>socket.send(JSON.stringify(m));
  await page.routeWebSocket('**/session',ws=>{socket=ws;ws.onMessage(raw=>{
    const m=JSON.parse(raw as string);
    if(m.type==='start'){emit({type:'ready'});emit({type:'state',slide,epoch,mode:'presentation',resume:slide});}
    if(m.type==='drained'){
      drains.push(slide);
      if(slide<6){slide++;epoch++;emit({type:'clear',epoch});emit({type:'state',slide,epoch,mode:'presentation',resume:slide});}
      else emit({type:'status',status:'listening'});
    }
  });});
  await page.goto('/');await page.getByRole('button',{name:/Start presentation/}).click();await expect(page.getByTestId('status')).toContainText('listening');
  for(let id=1;id<=6;id++){
    const prior=drains.length;
    emit({type:'audio',epoch,data:Buffer.alloc(24000).toString('base64')});emit({type:'turn-end',epoch});
    expect(drains.length).toBe(prior);
    await expect.poll(()=>drains.length).toBe(id);
  }
  expect(drains).toEqual([1,2,3,4,5,6]);await expect(page.locator('h1')).toHaveText('One loop. Three boundaries.');await page.getByRole('button',{name:'End session'}).click();
});
test('microphone denial and provider quota failures give actionable recovery',async({page})=>{
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');};});
  await page.goto('/');await page.getByRole('button',{name:/Start presentation/}).click();await expect(page.getByRole('alert')).toContainText('permission was denied');await expect(page.getByRole('button',{name:/Start presentation/})).toBeEnabled();
});
test('connection and quota failure stop the session and allow restart',async({page})=>{
  await page.routeWebSocket('**/session',ws=>ws.onMessage(()=>ws.send(JSON.stringify({type:'error',message:'Free-tier quota is unavailable. Wait before starting another session.'}))));
  await page.goto('/');await page.getByRole('button',{name:/Start presentation/}).click();await expect(page.getByRole('alert')).toContainText('quota');await expect(page.getByTestId('status')).toHaveText('error');await expect(page.getByRole('button',{name:/Start presentation/})).toBeEnabled();
});

test('local speech stops playback before any server acknowledgment',async({page})=>{
  await page.addInitScript(()=>{
    navigator.mediaDevices.getUserMedia=async()=>{
      const context=new AudioContext({sampleRate:24000});await context.resume();
      const tone=context.createOscillator(),gain=context.createGain(),destination=context.createMediaStreamDestination();
      tone.frequency.value=220;gain.gain.value=0;tone.connect(gain).connect(destination);tone.start();
      (window as any).testSpeechGain=gain;
      destination.stream.getTracks().forEach(track=>{const stop=track.stop.bind(track);track.stop=()=>{stop();tone.stop();void context.close();};});
      return destination.stream;
    };
  });
  let socket:WebSocketRoute;const messages:any[]=[];
  await page.routeWebSocket('**/session',ws=>{socket=ws;ws.onMessage(raw=>{const m=JSON.parse(raw as string);messages.push(m);if(m.type==='start')ws.send(JSON.stringify({type:'ready'}));});});
  await page.goto('/');await page.getByRole('button',{name:/Start presentation/}).click();await expect(page.getByTestId('status')).toContainText('listening');
  socket!.send(JSON.stringify({type:'audio',epoch:0,data:Buffer.alloc(96000).toString('base64')}));await expect(page.getByTestId('status')).toContainText('speaking');
  await page.evaluate(()=>(window as any).testSpeechGain.gain.value=0.1);
  await expect.poll(()=>messages.some(m=>m.type==='speech-start')).toBe(true);
  await expect(page.getByTestId('status')).toContainText('listening');
  socket!.send(JSON.stringify({type:'audio',epoch:0,data:Buffer.alloc(24000).toString('base64')}));await expect(page.getByTestId('status')).toContainText('listening');
  await page.evaluate(()=>(window as any).testSpeechGain.gain.value=0);
  await expect.poll(()=>messages.some(m=>m.type==='speech-end')).toBe(true);
  expect(messages.some(m=>m.type==='audio')).toBe(true);
  await page.getByRole('button',{name:'End session'}).click();
});
