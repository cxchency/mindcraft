export default 
{
    "minecraft_version": "1.20.2", // supports up to 1.20.4
    "host": "127.0.0.1", // or "localhost", "your.ip.address.here"
    "port": 25577,
    // "host": "127.0.0.1", // or "localhost", "your.ip.address.here"
    // "port": 29094,
    "auth": "mojang", // or "microsoft"
    
    "profiles": [
        "./andy.json",
        // add more profiles here, check ./profiles/ for more
        // more than 1 profile will require you to /msg each bot indivually
    ],
    "load_memory": false, // load memory from previous session
    "init_message": "", // sends to all on spawn
    "allow_insecure_coding": false, // disable at own risk
    "code_timeout_mins": 10, // -1 for no timeout
}