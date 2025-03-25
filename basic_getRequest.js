import http from 'k6/http';
import { sleep } from 'k6';

const baseURL = 'https://reqres.in';

export default function () {
    let page = 2; 
    http.get(`${baseURL}/api/users?page=${page}`);
    sleep(1);
}