import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
class PageError extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main style={{margin:'80px auto',maxWidth:600,padding:'0 24px'}}><h1>学习页面暂时无法显示</h1><p>请重新加载页面。如果仍有问题，请从系统托盘退出后重新启动。</p><button onClick={() => window.location.reload()}>重新加载</button></main>;
    return this.props.children;
  }
}
createRoot(document.getElementById('root')).render(<PageError><App/></PageError>);
