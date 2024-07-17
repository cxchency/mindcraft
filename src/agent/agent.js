import { History } from './history.js';
import { Coder } from './coder.js';
import { Prompter } from './prompter.js';
import { initModes } from './modes.js';
import { initBot } from '../utils/mcdata.js';
import { containsCommand, commandExists, executeCommand, truncCommandMessage } from './commands/index.js';
import { NPCContoller } from './npc/controller.js';
import { MemoryBank } from './memory_bank.js';
import settings from '../../settings.js';
import { mineflayer as mineflayerViewer } from 'prismarine-viewer';
import * as skills from './library/skills.js';
import * as world from './library/world.js';

export class Agent {
    async start(profile_fp, load_mem=false, init_message=null) {
        this.prompter = new Prompter(this, profile_fp);
        this.name = this.prompter.getName();
        this.history = new History(this);
        this.coder = new Coder(this);
        this.npc = new NPCContoller(this);
        this.memory_bank = new MemoryBank();

        // await this.prompter.initExamples();

        console.log('正在登录...');
        this.bot = initBot(this.name);
        
        initModes(this);

        if (load_mem)
            this.history.load();

        this.bot.once('spawn', async () => {
            console.log('机器人正在运行');

            

            // 等待片刻，以便状态不为空
            await new Promise((resolve) => setTimeout(resolve, 1000));

            console.log(`${this.name} 已生成。`);

            mineflayerViewer(this.bot, { port: 3003 }) // Start the viewing server on port 3000

            // Draw the path followed by the bot
            const path = [this.bot.entity.position.clone()]
            this.bot.on('move', () => {
                if (path[path.length - 1].distanceTo(this.bot.entity.position) > 1) {
                path.push(this.bot.entity.position.clone())
                this.bot.viewer.drawLine('path', path)
                }
            })
            
            const arrowPositions = new Map();

            this.bot._client.on('hurt_animation', (packet) => {
                const entity = this.bot.entities[packet.entityId];
                if (!entity) return;
                if (this.bot.health == 0) return;
                
                if (entity === this.bot.entity) {
                    // console.log(`Received damage packet: ${JSON.stringify(packet, null, 2)}`);
                        
                    let kill = false;
                    if (this.bot.health < 12) {
                        kill = true;
                    } else if (this.bot.health >= 12 && this.bot.health < 18) {
                        kill = false;
                    } else {
                        return;
                    }
                
                    // 查找最近的攻击者
                    const attacker = this.bot.nearestEntity((e) => {
                        return (e.type === 'mob' || e.type === 'player' && e.username !== 'cxchency') && e.position.distanceTo(this.bot.entity.position) < 10;
                    });
                
                    if (attacker) {
                        console.log(`Attacked by ${attacker.username || attacker.name}, kill: ${kill}`);
                        skills.attackEntity(this.bot, attacker, kill); // 执行攻击行为，根据 kill 参数来决定是否杀死攻击者
                    } else {
                        console.log('No attacker found');
                    }
                }
            });


            this.bot.on("entityMoved", async (entity) => {
                //console.log("正在检测箭矢");
                let dangerArrows = null;
                let distance = entity.position.distanceTo(this.bot.entity.position);
                let velocity = entity.velocity.normalize();
                let toBot = this.bot.entity.position.minus(entity.position).normalize();
                let dot = velocity.dot(toBot);

                if (this.bot.health == 0) return;
                if (this.bot.pathfinder.isMoving()) return;

                if (entity.name === 'arrow' || entity.name === 'trident') {
                    const prevPos = arrowPositions.get(entity.id);
                    const currentPos = entity.position.clone();
                    arrowPositions.set(entity.id, currentPos);
                    // console.log(arrowPositions);

                    if (prevPos) {
                        const positionChange = currentPos.distanceTo(prevPos);
                        // console.log(currentPos + currentPos);
                        const positionChangeThreshold = 0.1; // 位置变化阈值

                        if (distance <= 32 && dot >= 0.85 && positionChange > positionChangeThreshold) {
                            
                            dangerArrows = entity;
                        }
                    }
                }

                if (dangerArrows) {
                    // this.bot.setControlState('jump', true); // 立即跳跃
                    await skills.Flash(this.bot, dangerArrows, 2);
                    // this.bot.setControlState('jump', false); // 闪避完后停止跳跃
                    //this.bot.whisper("Glasden", "有刺客喵！");
                }
            });
            

            

            this.coder.clear();
            
            const ignore_messages = [
                "将自己的游戏模式设置为",
                "将时间设置为",
                "将难度设置为",
                "传送 ",
                "将天气设置为",
                "游戏规则 "
            ];
            const eventname = settings.profiles.length > 1 ? 'whisper' : 'chat';
            this.bot.on(eventname, (username, message) => {
                
                if (message == 'clerk-stop') {
                    this.history.save();
                    cleanKill()
                };

                if (message == 'clerk-clear') {
                    this.history.clear()
                    this.bot.chat('已清空记录');
                };

                if (!message.includes("店员") && !username.includes("店员") && !username.includes("clerk") && username != "消息互通")
                    {
                        this.history.add(username, message);
                        return
                    };

                if (username === this.name) return;

                if (username.includes("店员")) return;

                if (username.includes("clerk")) return;

                if (username == "消息互通") return;
                
                if (ignore_messages.some((m) => message.startsWith(m))) return;

                console.log('收到来自', username, '的消息:', message);
    
                this.handleMessage(username, message);
            });

            // 设置机器人在饥饿时自动吃食物
            this.bot.autoEat.enable()
            this.bot.autoEat.options = {
                priority: 'foodPoints',
                startAt: 19,
                bannedFood: ["rotten_flesh", "spider_eye", "poisonous_potato", "pufferfish", "chicken"]
            };

            // if (init_message) {
            //     this.handleMessage('system', init_message);
            // } else {
            //     this.bot.chat('你好，世界！我是 ' + this.name);
            //     this.bot.emit('finished_executing');
            // }

            this.startEvents();
        });
    }

    cleanChat(message) {
        // 换行符被解释为单独的聊天，这会触发垃圾邮件过滤器。用空格替换它们
        message = message.replaceAll('\n', '  ');
        return this.bot.chat(message);
    }

    async handleMessage(source, message) {
        const user_command_name = containsCommand(message);
        if (user_command_name) {
            if (!commandExists(user_command_name)) {
                this.bot.chat(`命令 '${user_command_name}' 不存在。`);
                return;
            }
            this.bot.chat(`*${source} 使用了 ${user_command_name.substring(1)}*`);
            let execute_res = await executeCommand(this, message);
            if (user_command_name === '!newAction') {
                // 所有用户发起的命令都被机器人忽略，除了这个
                // 添加前面的消息到历史记录中，为 newAction 提供上下文
                let truncated_msg = message.substring(0, message.indexOf(user_command_name)).trim();
                this.history.add(source, truncated_msg);
            }
            if (execute_res) 
                this.cleanChat(execute_res);
            return;
        }

        await this.history.add(source, message);

        for (let i=0; i<5; i++) {
            let history = this.history.getHistory();
            let res = await this.prompter.promptConvo(history);

            let command_name = containsCommand(res);

            if (command_name) { // 包含查询或命令
                console.log(`完整响应: ""${res}""`)
                res = truncCommandMessage(res); // 忽略命令后的所有内容
                this.history.add(this.name, res);
                if (!commandExists(command_name)) {
                    this.history.add('system', `命令 ${command_name} 不存在。`);
                    console.log('代理生成了不存在的命令:', command_name)
                    continue;
                }
                let pre_message = res.substring(0, res.indexOf(command_name)).trim();
                let chat_message = `*使用了 ${command_name.substring(1)}*`;
                if (pre_message.length > 0)
                    chat_message = `${pre_message}  ${chat_message}`;
                this.cleanChat(chat_message);

                let execute_res = await executeCommand(this, res);

                console.log('代理执行了:', command_name, '并获得了:', execute_res);

                if (execute_res)
                    this.history.add('system', execute_res);
                else
                    break;
            }
            else { // 对话响应
                this.history.add(this.name, res);
                this.cleanChat(res);
                console.log('纯对话响应:', res);
                break;
            }
        }

        this.history.save();
        this.bot.emit('finished_executing');
    }

    startEvents() {
        // 自定义事件
        this.bot.on('time', () => {
            if (this.bot.time.timeOfDay == 0)
            this.bot.emit('sunrise');
            else if (this.bot.time.timeOfDay == 6000)
            this.bot.emit('noon');
            else if (this.bot.time.timeOfDay == 12000)
            this.bot.emit('sunset');
            else if (this.bot.time.timeOfDay == 18000)
            this.bot.emit('midnight');
        });

        let prev_health = this.bot.health;
        this.bot.lastDamageTime = 0;
        this.bot.lastDamageTaken = 0;
        this.bot.on('health', () => {
            if (this.bot.health < prev_health) {
                this.bot.lastDamageTime = Date.now();
                this.bot.lastDamageTaken = prev_health - this.bot.health;
            }
            prev_health = this.bot.health;
        });
        // 日志回调
        this.bot.on('error' , (err) => {
            console.error('错误事件!', err);
        });
        this.bot.on('end', (reason) => {
            console.warn('机器人断开连接！终止代理进程。', reason)
            this.cleanKill('机器人断开连接！终止代理进程。');
        });
        this.bot.on('death', () => {
            this.bot.chat("/back")
            this.coder.cancelResume();
            this.coder.stop();
        });
        this.bot.on('kicked', (reason) => {
            console.warn('机器人被踢出!', reason);
            this.cleanKill('机器人被踢出！终止代理进程。');
        });
        this.bot.on('messagestr', async (message, _, jsonMsg) => {
            if (jsonMsg.translate && jsonMsg.translate.startsWith('death') && message.startsWith(this.name)) {
                // 生成一个随机数，如果小于0.1，则有10%的概率触发
                console.log('代理死亡: ', message);
                this.history.add('system', `你死了，最后的信息是: '${message}'。之前的操作已停止，你已经重生。通知用户并执行任何必要的操作。`);
            }
        });
        this.bot.on('idle', () => {
            this.bot.clearControlStates();
            this.bot.pathfinder.stop(); // 清除任何遗留的路径查找
            this.bot.modes.unPauseAll();
            // this.coder.executeResume();
        });

        // 初始化 NPC 控制器
        this.npc.init();

        // 此更新循环确保每次 update() 都一次调用一个，即使它花费的时间超过了间隔
        const INTERVAL = 300;
        setTimeout(async () => {
            while (true) {
                let start = Date.now();
                await this.bot.modes.update();
                let remaining = INTERVAL - (Date.now() - start);
                if (remaining > 0) {
                    await new Promise((resolve) => setTimeout(resolve, remaining));
                }
            }
        }, INTERVAL);

        this.bot.emit('idle');
    }

    isIdle() {
        return !this.coder.executing && !this.coder.generating;
    }
    
    cleanKill(msg='终止代理进程...') {
        this.history.add('system', msg);
        this.bot.chat('再见，沃玛岛')
        this.history.save();
        process.exit(1);
    }
}
