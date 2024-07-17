import axios from 'axios';
import { getKey, hasKey } from '../utils/keys.js';

export class GPT {
    constructor(model_name, url) {
        this.model_name = model_name || "deepseek-chat";
        this.baseURL = url || "https://api.deepseek.com";
        this.apiKey = getKey('DEEPSEEK_API_KEY');
    }

    async sendRequest(chat_cache, systemMessage, stop_seq = '***') {
        let chat_list = [];
        let user_chat_cache = [];
    
        // Process each chat item in chat_cache
        for (let i = 0; i < chat_cache.length; i++) {
            let chat_item = chat_cache[i];
    
            if (chat_item.role !== 'assistant') {
                // If it's a user message, add to user_chat_cache
                user_chat_cache.push(chat_item.content);
            } else {
                // If it's an assistant message
                let user_content = '';
    
                // Combine consecutive user messages into one
                for (let user_chat of user_chat_cache) {
                    user_content += user_chat + '\n';
                }
    
                // Add combined user messages and current assistant message to chat_list
                chat_list.push({ role: 'user', content: user_content });
                chat_list.push({ role: 'assistant', content: chat_item.content });
    
                // Clear user_chat_cache
                user_chat_cache = [];
            }
    
            // If it's the last message, force combine user cache and add last message independently
            if (i === chat_cache.length - 1) {
                let user_content = '';
    
                // Combine remaining user messages into one
                for (let user_chat of user_chat_cache) {
                    user_content += user_chat + '\n';
                }
    
                // Add last combined user message if not empty
                if (user_content !== '') {
                    chat_list.push({ role: 'user', content: user_content });
                }
            }
        }
    
        // Insert system message at the beginning of chat_list
        chat_list.unshift({ role: 'system', content: systemMessage });
    
        console.log(`${JSON.stringify(chat_list, null, 2)}`);
    
        let res = null;
        try {
            console.log('Awaiting deepseek api response...')
            const response = await axios.post(`${this.baseURL}/chat/completions`, {
                model: this.model_name,
                messages: chat_list,
                stream: false
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });
    
            const completion = response.data;
            console.log(`${JSON.stringify(response.data, null, 2)}`);
            if (completion.choices[0].finish_reason === 'length') {
                throw new Error('Context length exceeded');
            }
            console.log('Received.');
            res = completion.choices[0].message.content;
        } catch (err) {
            if ((err.message === 'Context length exceeded' || err.code === 'context_length_exceeded') && chat_list.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return await this.sendRequest(chat_list.slice(1), systemMessage, stop_seq);
            } else {
                console.log(err);
                res = 'My brain disconnected, try again.';
            }
        }
        return res;
    }
    


    async embed(text) {
        try {
            const response = await axios.post('https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding', {
                model: 'text-embedding-v2',
                input: {
                    texts: Array.isArray(text) ? text : [text]
                }
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getKey('ALIYUN_API_KEY')}`
                }
            });

            return response.data.output.embeddings[0].embedding;
        } catch (error) {
            console.error('Error fetching embedding from Aliyun:', error);
            throw error;
        }
    }
}
